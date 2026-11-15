import { useSyncExternalStore } from 'react'
import type { Activity } from '@/lib/model/activity'
import type { Note } from '@/lib/model/note'
import { activitiesStore } from '@/lib/storage/activitiesStore'
import { notesStore } from '@/lib/storage/notesStore'
import { settingsStore } from '@/lib/storage/settingsStore'

export function useNotes(): Note[] {
  return useSyncExternalStore(notesStore.subscribe, notesStore.getSnapshot)
}

export function useActivities(): Activity[] {
  return useSyncExternalStore(activitiesStore.subscribe, activitiesStore.getSnapshot)
}

export function useSettings() {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot)
}
