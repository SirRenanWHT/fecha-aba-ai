import type { KeyboardEvent, MouseEvent } from 'react'
import { Icon } from '@/components/Icon'
import {
  ACTIVITY_PRIORITY_LABELS,
  ACTIVITY_STATUS_LABELS,
  activityDueLabel,
  isActivityOverdue,
  subtaskDoneCount,
  type Activity,
} from '@/lib/model/activity'
import { cn } from '@/lib/utils/cn'

type ActivityRowProps = {
  activity: Activity
  onOpen: (id: string) => void
  onToggleDone: (activity: Activity) => void
}

export function ActivityRow({ activity, onOpen, onToggleDone }: ActivityRowProps) {
  const done = activity.status === 'done'
  const overdue = isActivityOverdue(activity)
  const due = activityDueLabel(activity)
  const doneSubtasks = subtaskDoneCount(activity.subtasks)

  function open(): void {
    onOpen(activity.id)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  function handleToggle(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation()
    onToggleDone(activity)
  }

  return (
    <article
      className={cn('activity-row', done && 'is-done', overdue && 'is-overdue')}
      data-status={activity.status}
      role="link"
      tabIndex={0}
      aria-label={`Abrir atividade ${activity.title || 'sem título'}`}
      onClick={open}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={cn('activity-check', done && 'is-done')}
        aria-label={done ? 'Reabrir atividade' : 'Concluir atividade'}
        aria-pressed={done}
        onClick={handleToggle}
      >
        {done ? <Icon name="check" size={12} /> : null}
      </button>

      <div className="activity-row-main">
        <div className="activity-row-head">
          <h3 className="activity-row-title">{activity.title.trim() || 'Sem título'}</h3>
          <span className={cn('status-pill', `status-pill--${activity.status}`)}>
            {ACTIVITY_STATUS_LABELS[activity.status]}
          </span>
        </div>

        {activity.description.trim() ? (
          <p className="activity-row-desc">{activity.description}</p>
        ) : null}

        <div className="activity-progress">
          <div className="activity-bar">
            <span style={{ width: `${activity.progress}%` }} />
          </div>
          <span className="activity-pct">{activity.progress}%</span>
          {activity.subtasks.length > 0 ? (
            <span className="activity-subcount">
              {doneSubtasks}/{activity.subtasks.length}
            </span>
          ) : null}
        </div>

        <div className="activity-meta">
          {activity.project ? (
            <span className="meta-chip">
              <Icon name="layers" size={12} />
              {activity.project}
            </span>
          ) : null}
          {due ? (
            <span className={cn('meta-chip', overdue && 'is-overdue')}>
              <Icon name="calendar" size={12} />
              {due}
            </span>
          ) : null}
          <span className={cn('meta-chip', `priority-${activity.priority}`)}>
            <Icon name="flag" size={12} />
            {ACTIVITY_PRIORITY_LABELS[activity.priority]}
          </span>
          {activity.progressMode === 'auto' && activity.subtasks.length > 0 ? (
            <span className="meta-chip meta-chip--ghost">automático</span>
          ) : null}
        </div>
      </div>

      <Icon name="chevron-right" size={18} className="activity-row-chevron" />
    </article>
  )
}
