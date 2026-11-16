import { z } from 'zod'

const INVITE_MAP_KEY = 'ndb:v2:collab-invite-map'

export function getCollaborativeTokenForNote(noteId: string): string | undefined {
  try {
    const invites = z.record(z.string(), z.string()).parse(
      JSON.parse(localStorage.getItem(INVITE_MAP_KEY) ?? '{}'),
    )
    return invites[noteId]
  } catch {
    return undefined
  }
}
