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
      priority: source.priority,
      project: source.project,
    })
    remember(result.document_id, activity.id)
  }
  remember(result.document_id, activity.id, token)
  return { room: result.document_id, activity: activitySchema.parse(activity) }
}

export async function saveCollaborativeActivity(room: string, activity: Activity): Promise<void> {
  const { error } = await supabase.from('collab_activities')
    .update({ activity, updated_at: new Date().toISOString() })
    .eq('document_id', room)
  if (error) throw error
}
