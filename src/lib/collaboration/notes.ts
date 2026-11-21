import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { generateJSON } from '@tiptap/html'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { z } from 'zod'
import type { Note } from '@/lib/model/note'
import { noteTransferSchema, type NoteTransfer } from '@/lib/share/types'
import { importNoteTransfer } from '@/lib/share/transfer'
import { notesStore } from '@/lib/storage/notesStore'
import { supabase, ensureAnonymousSession } from './supabase'

const ROOM_MAP_KEY = 'ndb:v2:collab-room-map'
const INVITE_MAP_KEY = 'ndb:v2:collab-invite-map'

const SharedTaskList = TaskList.extend({
  priority: 101,
  parseHTML() {
    return [
      { tag: 'ul[data-task-list="true"]' },
      { tag: 'ul:has(> li[data-task="true"])' },
    ]
  },
})

const SharedTaskItem = TaskItem.extend({
  parseHTML() {
    return [
      { tag: 'li[data-type="taskItem"]' },
      { tag: 'li[data-task="true"]' },
    ]
  },
})

export const COLLAB_EDITOR_EXTENSIONS = [
  StarterKit.configure({ undoRedo: false, link: false, underline: false }),
  Underline,
  Link.configure({ openOnClick: false }),
  SharedTaskList.configure({ HTMLAttributes: { 'data-task-list': 'true' } }),
  SharedTaskItem.configure({ nested: true, HTMLAttributes: { 'data-task': 'true' } }),
]

function saveRoomMap(room: string, noteId: string): void {
  const current = getRoomMap()
  current[room] = noteId
  localStorage.setItem(ROOM_MAP_KEY, JSON.stringify(current))
}

function getRoomMap(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ROOM_MAP_KEY) ?? '{}')
    return z.record(z.string(), z.string()).parse(parsed)
  } catch {
    return {}
  }
}

function saveInvite(noteId: string, token: string): void {
  let invites: Record<string, string> = {}
  try {
    invites = z.record(z.string(), z.string()).parse(
      JSON.parse(localStorage.getItem(INVITE_MAP_KEY) ?? '{}'),
    )
  } catch {
    // Recria o índice local caso ele tenha sido removido ou corrompido.
  }
  invites[noteId] = token
  localStorage.setItem(INVITE_MAP_KEY, JSON.stringify(invites))
}

function encode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decode(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function makeInitialYjsState(note: NoteTransfer['note']): string {
  const extensions = COLLAB_EDITOR_EXTENSIONS
  const schema = getSchema(extensions)
  const json = generateJSON(note.content || '<p></p>', extensions)
  const doc = prosemirrorJSONToYDoc(schema, json)
  doc.getText('title').insert(0, note.title)
  const encoded = encode(Y.encodeStateAsUpdate(doc))
  doc.destroy()
  return encoded
}

export async function createCollaborativeInvite(
  transfer: NoteTransfer,
  captchaToken?: string,
): Promise<string> {
  await ensureAnonymousSession(captchaToken)
  const { data, error } = await supabase.rpc('create_collab_invite', {
    p_payload: transfer,
    p_state: makeInitialYjsState(transfer.note),
  })
  if (error) throw error

  const result = z.object({ document_id: z.string().uuid(), token: z.string().min(30) }).parse(data)
  saveRoomMap(result.document_id, transfer.note.id)
  saveInvite(transfer.note.id, result.token)
  notesStore.update(transfer.note.id, { collaborationRoom: result.document_id })
  return result.token
}

export async function joinCollaborativeInvite(
  token: string,
  captchaToken?: string,
): Promise<{ room: string; note: Note }> {
  await ensureAnonymousSession(captchaToken)
  const { data, error } = await supabase.rpc('join_collab_invite', { p_token: token })
  if (error) throw error

  const result = z
    .object({ document_id: z.string().uuid(), payload: noteTransferSchema })
    .parse(data)
  const noteId = getRoomMap()[result.document_id]
  let note = noteId ? notesStore.getById(noteId) : undefined
  if (!note) {
    note = await importNoteTransfer(result.payload)
    saveRoomMap(result.document_id, note.id)
  }
  saveInvite(note.id, token)
  saveRoomMap(result.document_id, note.id)
  note = notesStore.update(note.id, { collaborationRoom: result.document_id }) ?? note
  return { room: result.document_id, note }
}

export async function openCollaborativeNoteRoom(
  room: string,
  captchaToken?: string,
): Promise<{ room: string; note: Note }> {
  await ensureAnonymousSession(captchaToken)
  const { data, error } = await supabase.from('collab_documents').select('payload').eq('id', room).maybeSingle()
  if (error) throw error
  const parsed = z.object({ kind: z.literal('note'), note: noteTransferSchema }).safeParse(data?.payload)
  if (!parsed.success) throw new Error('A nota compartilhada não está disponível para esta sessão.')
  const mappedId = getRoomMap()[room]
  let note = notesStore.getSnapshot().find((item) =>
    item.collaborationRoom === room || item.id === mappedId || item.id === parsed.data.note.note.id,
  )
  if (!note) note = await importNoteTransfer(parsed.data.note)
  saveRoomMap(room, note.id)
  note = notesStore.update(note.id, { collaborationRoom: room }) ?? note
  return { room, note }
}

/** Reconcile local copies with the latest persisted Yjs state for joined note rooms. */
export async function syncSharedNoteRooms(): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) return
  const { data: memberships, error: membershipError } = await supabase
    .from('collab_members').select('document_id')
  if (membershipError) throw membershipError
  const rooms = [...new Set((memberships ?? []).map((row) => row.document_id))]
  for (const room of rooms) {
    const { data: document, error: documentError } = await supabase
      .from('collab_documents').select('payload').eq('id', room).maybeSingle()
    if (documentError) throw documentError
    const transfer = noteTransferSchema.safeParse((document?.payload as { kind?: string; note?: unknown } | null)?.kind === 'note'
      ? (document?.payload as { note: unknown }).note : null)
    if (!transfer.success) continue

    const { data: updates, error: updatesError } = await supabase
      .from('collab_yjs_updates').select('update_b64').eq('room', room).order('id')
    if (updatesError) throw updatesError
    const doc = new Y.Doc()
    for (const row of updates ?? []) if (row.update_b64) Y.applyUpdate(doc, decode(row.update_b64))
    const content = generateHTML(yDocToProsemirrorJSON(doc, 'prosemirror'), COLLAB_EDITOR_EXTENSIONS)
    const title = doc.getText('title').toString()
    doc.destroy()

    const mappedId = getRoomMap()[room]
    const local = notesStore.getSnapshot().find((item) =>
      item.collaborationRoom === room || item.id === mappedId || item.id === transfer.data.note.id,
    )
    const note = local ?? await importNoteTransfer(transfer.data)
    saveRoomMap(room, note.id)
    notesStore.update(note.id, { title, content, collaborationRoom: room })
  }
}
