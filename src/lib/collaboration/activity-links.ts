const ROOM_MAP_KEY = 'ndb:v2:collab-activity-room-map'
const INVITE_MAP_KEY = 'ndb:v2:collab-activity-invite-map'

function readMap(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string> }
  catch { return {} }
}

export function getCollaborativeActivityToken(activityId: string): string | undefined {
  return readMap(INVITE_MAP_KEY)[activityId]
}

export function saveCollaborativeActivityLink(room: string, activityId: string, token?: string): void {
  const rooms = readMap(ROOM_MAP_KEY)
  rooms[room] = activityId
  localStorage.setItem(ROOM_MAP_KEY, JSON.stringify(rooms))
  if (token) {
    const invites = readMap(INVITE_MAP_KEY)
    invites[activityId] = token
    localStorage.setItem(INVITE_MAP_KEY, JSON.stringify(invites))
  }
}

export function getLocalCollaborativeActivityId(room: string): string | undefined {
  return readMap(ROOM_MAP_KEY)[room]
}
