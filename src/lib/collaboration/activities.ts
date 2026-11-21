import * as Y from 'yjs'
import { z } from 'zod'
import type { Activity } from '@/lib/model/activity'
import { activitySchema } from '@/lib/model/activity'
import { activitiesStore } from '@/lib/storage/activitiesStore'
import { getLocalCollaborativeActivityId, saveCollaborativeActivityLink } from './activity-links'
import { supabase, ensureAnonymousSession } from './supabase'

function encode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function makeState(activity: Activity): string {
  const doc = new Y.Doc()
  const shared = doc.getMap<unknown>('activity')
  for (const [key, value] of Object.entries(activity)) shared.set(key, value)
  const state = encode(Y.encodeStateAsUpdate(doc))
  doc.destroy()
  return state
}

function remember(room: string, activityId: string, token?: string): void {
  saveCollaborativeActivityLink(room, activityId, token)
}

export async function createCollaborativeActivityInvite(
  activity: Activity,
  captchaToken?: string,
): Promise<{ token: string; room: string }> {
  await ensureAnonymousSession(captchaToken)
  const { data, error } = await supabase.rpc('create_collab_activity_invite', {
    p_activity: activity,
    p_state: makeState(activity),
  })
  if (error) throw error
  const result = z.object({ document_id: z.string().uuid(), token: z.string().min(30) }).parse(data)
  remember(result.document_id, activity.id, result.token)
  activitiesStore.update(activity.id, { collaborationRoom: result.document_id }, { generateRecurrence: false })
  return { token: result.token, room: result.document_id }
}

export async function joinCollaborativeActivityInvite(
  token: string,
  captchaToken?: string,
): Promise<{ room: string; activity: Activity }> {
  await ensureAnonymousSession(captchaToken)
  const { data, error } = await supabase.rpc('join_collab_invite', { p_token: token })
  if (error) throw error

  const result = z.object({
    document_id: z.string().uuid(),
    payload: z.object({ kind: z.literal('activity'), activity: activitySchema }),
  }).parse(data)
  const { data: latest } = await supabase.from('collab_activities')
    .select('activity').eq('document_id', result.document_id).maybeSingle()
  const source = activitySchema.parse(latest?.activity ?? result.payload.activity)
  const localId = getLocalCollaborativeActivityId(result.document_id)
  let activity = localId ? activitiesStore.getById(localId) : undefined
  if (!activity) {
    activity = activitiesStore.create({
      title: source.title,
      description: source.description,
      status: source.status,
      progressMode: source.progressMode,
      progress: source.progress,
      subtasks: source.subtasks,
      dueDate: source.dueDate,
      recurrence: source.recurrence,
      priority: source.priority,
      project: source.project,
    })
    remember(result.document_id, activity.id)
  }
  remember(result.document_id, activity.id, token)
  activity = activitiesStore.update(activity.id, { collaborationRoom: result.document_id }, { generateRecurrence: false }) ?? activity
  return { room: result.document_id, activity: activitySchema.parse(activity) }
}

export async function saveCollaborativeActivity(room: string, activity: Activity): Promise<void> {
  const { error } = await supabase.rpc('save_collab_activity', {
    p_document_id: room,
    p_activity: activity,
  })
  if (error) throw error
  await syncSharedActivityRooms()
  void import('./push').then(({ notifySharedUpdate }) => notifySharedUpdate(room, 'activity'))
    .catch((pushError) => console.warn('Não foi possível enviar o aviso de atualização', pushError))
}

export async function syncSharedActivityRooms(): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) return
  const { data: memberships, error: membershipError } = await supabase
    .from('collab_members').select('document_id')
  if (membershipError) throw membershipError
  const rooms = [...new Set((memberships ?? []).map((row) => row.document_id))]
  if (rooms.length === 0) return

  for (let index = 0; index < rooms.length; index += 500) {
    const batch = rooms.slice(index, index + 500)
    const { data, error } = await supabase.from('collab_activities')
      .select('document_id, activity').in('document_id', batch)
    if (error) throw error
    for (const row of data ?? []) {
      const room = row.document_id
      const parsed = activitySchema.safeParse(row.activity)
      if (!parsed.success) continue
      const source = parsed.data
      const localId = getLocalCollaborativeActivityId(room)
      const existing = (localId ? activitiesStore.getById(localId) : undefined)
        ?? activitiesStore.getSnapshot().find((item) => item.collaborationRoom === room)
      if (existing) {
        remember(room, existing.id)
        activitiesStore.update(existing.id, { ...source, id: existing.id, collaborationRoom: room }, { generateRecurrence: false })
        continue
      }
      const local = activitiesStore.create({
        title: source.title,
        description: source.description,
        status: source.status,
        progressMode: source.progressMode,
        progress: source.progress,
        subtasks: source.subtasks,
        dueDate: source.dueDate,
        recurrence: source.recurrence,
        priority: source.priority,
        project: source.project,
      })
      remember(room, local.id)
      activitiesStore.update(local.id, { collaborationRoom: room }, { generateRecurrence: false })
    }
  }
}
