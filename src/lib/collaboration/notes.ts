import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { generateJSON } from '@tiptap/html'
import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap'
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
  return { room: result.document_id, note }
}
