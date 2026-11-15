import type { ChangeEvent } from 'react'
import { Icon } from '@/components/Icon'
import {
  ACTIVITY_PRIORITY_LABELS,
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABELS,
  activityDueLabel,
  isActivityOverdue,
  subtaskDoneCount,
  type Activity,
  type ActivityStatus,
} from '@/lib/model/activity'
import { cn } from '@/lib/utils/cn'

type KanbanCardProps = {
  activity: Activity
  onOpen: (id: string) => void
  onMove: (id: string, status: ActivityStatus) => void
}

export function KanbanCard({ activity, onOpen, onMove }: KanbanCardProps) {
  const done = activity.status === 'done'
  const overdue = isActivityOverdue(activity)
  const due = activityDueLabel(activity)
  const doneSubtasks = subtaskDoneCount(activity.subtasks)

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>): void {
    event.stopPropagation()
    onMove(activity.id, event.target.value as ActivityStatus)
  }

  return (
    <article
      className={cn('kanban-card', done && 'is-done', overdue && 'is-overdue')}
      data-status={activity.status}
      role="link"
      tabIndex={0}
      aria-label={`Abrir atividade ${activity.title || 'sem título'}`}
      onClick={() => onOpen(activity.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(activity.id)
        }
      }}
    >
      <div className="kanban-card-top">
        <span
          className={cn('priority-dot', `priority-${activity.priority}`)}
          title={`Prioridade ${ACTIVITY_PRIORITY_LABELS[activity.priority]}`}
        />
        {due ? (
          <span className={cn('kanban-due', overdue && 'is-overdue')}>
            <Icon name="calendar" size={11} />
            {due}
          </span>
        ) : null}
      </div>

      <h4 className="kanban-title">{activity.title.trim() || 'Sem título'}</h4>
      {activity.project ? <span className="kanban-project">{activity.project}</span> : null}

      <div className="activity-bar kanban-bar">
        <span style={{ width: `${activity.progress}%` }} />
      </div>

      <div className="kanban-foot">
        <span className="kanban-sub">
          {activity.subtasks.length > 0
            ? `${doneSubtasks}/${activity.subtasks.length} subtarefas`
            : `${activity.progress}%`}
        </span>
        <select
          className="kanban-status-select"
          value={activity.status}
          aria-label="Mudar etapa da atividade"
          onClick={(event) => event.stopPropagation()}
          onChange={handleStatusChange}
        >
          {ACTIVITY_STATUSES.map((status) => (
            <option value={status} key={status}>
              {ACTIVITY_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
    </article>
  )
}
