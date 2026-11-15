import { nanoid } from 'nanoid'
import type {
  Activity,
  ActivityPriority,
  ActivityStatus,
  Subtask,
} from '@/lib/model/activity'
import {
  activitySchema,
  changeActivityStatus,
  normalizeActivity,
  toggleActivitySubtask,
} from '@/lib/model/activity'
import { readCollection, STORAGE_KEYS, writeCollection } from './storage'

type Listener = () => void

const listeners = new Set<Listener>()
let activities: Activity[] = readCollection(STORAGE_KEYS.activities, activitySchema)

function persist(): void {
  writeCollection(STORAGE_KEYS.activities, activities)
}

function emit(): void {
  for (const listener of listeners) listener()
}

function replace(next: Activity[]): void {
  activities = next
  persist()
  emit()
}

export type ActivityDraft = Partial<
  Pick<
    Activity,
    | 'title'
    | 'description'
    | 'status'
    | 'progressMode'
    | 'progress'
    | 'subtasks'
    | 'dueDate'
    | 'priority'
    | 'project'
  >
>

export const activitiesStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  getSnapshot(): Activity[] {
    return activities
  },

  getById(id: string): Activity | undefined {
    return activities.find((activity) => activity.id === id)
  },

  create(input: ActivityDraft = {}): Activity {
    const now = new Date().toISOString()
    const parsed = activitySchema.parse({
      id: nanoid(12),
      title: '',
      description: '',
      progressMode: 'auto',
      progress: 0,
      subtasks: [],
      priority: 'medium',
      project: '',
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    const activity = normalizeActivity(parsed, now)
    replace([activity, ...activities])
    return activity
  },

  update(id: string, patch: Partial<Activity>): Activity | undefined {
    const index = activities.findIndex((activity) => activity.id === id)
    if (index === -1) return undefined

    const now = new Date().toISOString()
    const parsed = activitySchema.parse({
      ...activities[index],
      ...patch,
      id,
      updatedAt: now,
    })
    const activity = normalizeActivity(parsed, now)
    const next = activities.slice()
    next[index] = activity
    replace(next)
    return activity
  },

  remove(id: string): Activity | undefined {
    const removed = activities.find((activity) => activity.id === id)
    if (!removed) return undefined
    replace(activities.filter((activity) => activity.id !== id))
    return removed
  },

  restore(activity: Activity): void {
    if (activities.some((item) => item.id === activity.id)) return
    replace([activity, ...activities])
  },

  toggleSubtask(id: string, subtaskId: string): Activity | undefined {
    const current = activities.find((activity) => activity.id === id)
    if (!current) return undefined
    const now = new Date().toISOString()
    const next = activitySchema.parse({
      ...toggleActivitySubtask(current, subtaskId, now),
      updatedAt: now,
    })
    return activitiesStore.update(id, next)
  },

  changeStatus(id: string, status: ActivityStatus): Activity | undefined {
    const current = activities.find((activity) => activity.id === id)
    if (!current) return undefined
    const now = new Date().toISOString()
    return activitiesStore.update(id, changeActivityStatus(current, status, now))
  },

  replaceAll(next: Activity[]): void {
    replace(next)
  },

  clear(): void {
    replace([])
  },
}

export type { ActivityPriority, Subtask }
