import { z } from 'zod'

export const ACTIVITY_STATUSES = ['todo', 'doing', 'done', 'paused'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const ACTIVITY_PRIORITIES = ['low', 'medium', 'high'] as const
export type ActivityPriority = (typeof ACTIVITY_PRIORITIES)[number]

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  done: 'Concluída',
  paused: 'Pausada',
}

export const ACTIVITY_PRIORITY_LABELS: Record<ActivityPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
}

export const subtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  done: z.boolean(),
})

export type Subtask = z.infer<typeof subtaskSchema>

export const activitySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  description: z.string().default(''),
  status: z.enum(ACTIVITY_STATUSES).default('todo'),
  progressMode: z.enum(['auto', 'manual']).default('auto'),
  progress: z.number().min(0).max(100).default(0),
  subtasks: z.array(subtaskSchema).max(100).default([]),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  priority: z.enum(ACTIVITY_PRIORITIES).default('medium'),
  project: z.string().max(60).default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
})

export type Activity = z.infer<typeof activitySchema>

export const MAX_SUBTASKS = 100

export function subtaskDoneCount(subtasks: Subtask[]): number {
  return subtasks.reduce((total, subtask) => total + (subtask.done ? 1 : 0), 0)
}

export function deriveProgress(activity: Activity): number {
  if (activity.progressMode === 'auto' && activity.subtasks.length > 0) {
    return Math.round((subtaskDoneCount(activity.subtasks) / activity.subtasks.length) * 100)
  }
  if (activity.progressMode === 'auto') {
    return activity.status === 'done' ? 100 : 0
  }
  return activity.progress
}

/**
 * Regras centrais, aplicadas tanto no editor quanto no store:
 * - modo automático com subtarefas: progresso e conclusão vêm delas;
 * - modo automático sem subtarefas: 100% apenas quando concluída;
 * - modo manual: 100% conclui; concluir força 100%.
 */
export function normalizeActivity(activity: Activity, now = new Date().toISOString()): Activity {
  const next: Activity = { ...activity }

  if (next.progressMode === 'auto') {
    if (next.subtasks.length > 0) {
      const done = subtaskDoneCount(next.subtasks)
      next.progress = Math.round((done / next.subtasks.length) * 100)

      if (done === next.subtasks.length) {
        if (next.status !== 'done') {
          next.status = 'done'
          next.completedAt = now
        } else if (!next.completedAt) {
          next.completedAt = now
        }
      } else if (next.status === 'done') {
        next.status = 'doing'
        next.completedAt = undefined
      } else if (done > 0 && next.status === 'todo') {
        next.status = 'doing'
      }
    } else {
      next.progress = next.status === 'done' ? 100 : 0
      next.completedAt = next.status === 'done' ? (next.completedAt ?? now) : undefined
    }
  } else if (next.progress >= 100) {
    next.progress = 100
    next.status = 'done'
    next.completedAt = next.completedAt ?? now
  } else if (next.status === 'done') {
    // Baixar o progresso manual reabre a atividade.
    next.status = 'doing'
    next.completedAt = undefined
  } else {
    next.completedAt = undefined
  }

  return next
}

export function toggleActivitySubtask(
  activity: Activity,
  subtaskId: string,
  now = new Date().toISOString(),
): Activity {
  const subtasks = activity.subtasks.map((subtask) =>
    subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask,
  )
  return normalizeActivity({ ...activity, subtasks }, now)
}

/**
 * Mudança explícita de status. Em modo automático, concluir marca todas as
 * subtarefas; voltar para "a fazer" reinicia o progresso.
 */
export function changeActivityStatus(
  activity: Activity,
  status: ActivityStatus,
  now = new Date().toISOString(),
): Activity {
  const next: Activity = { ...activity, status }

  if (status === 'done') {
    if (next.progressMode === 'auto' && next.subtasks.length > 0) {
      next.subtasks = next.subtasks.map((subtask) => ({ ...subtask, done: true }))
    }
    next.progress = 100
    next.completedAt = now
  } else {
    next.completedAt = undefined
    if (status === 'todo') {
      next.progress = 0
      if (next.progressMode === 'auto') {
        next.subtasks = next.subtasks.map((subtask) => ({ ...subtask, done: false }))
      }
    }
    if (
      status === 'doing' &&
      next.progressMode === 'auto' &&
      next.subtasks.length > 0 &&
      next.subtasks.every((subtask) => subtask.done)
    ) {
      next.subtasks = next.subtasks.map((subtask) => ({ ...subtask, done: false }))
      next.progress = 0
    }
  }

  return normalizeActivity(next, now)
}

export function isActivityOverdue(activity: Activity): boolean {
  if (!activity.dueDate || activity.status === 'done') return false
  return daysUntilDate(activity.dueDate) < 0
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function todayDateInput(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysUntilDate(value: string): number {
  const target = parseDateOnly(value)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const longDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatDueDate(value: string): string {
  const date = parseDateOnly(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return (sameYear ? shortDate : longDate).format(date)
}

export function activityDueLabel(activity: Activity): string | null {
  if (!activity.dueDate) return null
  if (activity.status === 'done') return formatDueDate(activity.dueDate)

  const diff = daysUntilDate(activity.dueDate)
  if (diff === 0) return 'Vence hoje'
  if (diff === 1) return 'Vence amanhã'
  if (diff < 0) {
    const days = Math.abs(diff)
    return `Atrasada há ${days} ${days === 1 ? 'dia' : 'dias'}`
  }
  if (diff <= 7) return `Em ${diff} dias`
  return formatDueDate(activity.dueDate)
}
