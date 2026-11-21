import { z } from 'zod'

const INVITE_MAP_KEY = 'ndb:v2:collab-invite-map'
const ROOM_MAP_KEY = 'ndb:v2:collab-room-map'

function readRoomMap(): Record<string, string> {
  try {
    return z.record(z.string(), z.string()).parse(
      JSON.parse(localStorage.getItem(ROOM_MAP_KEY) ?? '{}'),
    )
  } catch {
    return {}
  }
}

export function getCollaborativeRoomForNote(noteId: string): string | undefined {
  return Object.entries(readRoomMap()).find(([, localId]) => localId === noteId)?.[0]
}

export function isCollaborativeNote(note: { id: string; collaborationRoom?: string }): boolean {
  return Boolean(note.collaborationRoom || getCollaborativeRoomForNote(note.id))
}

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
