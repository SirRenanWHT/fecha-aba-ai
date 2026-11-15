import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { Button, IconButton } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useActivities } from '@/hooks/useStores'
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_PRIORITY_LABELS,
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABELS,
  MAX_SUBTASKS,
  activityDueLabel,
  changeActivityStatus,
  isActivityOverdue,
  normalizeActivity,
  subtaskDoneCount,
  toggleActivitySubtask,
  type Activity,
  type ActivityPriority,
  type ActivityStatus,
  type Subtask,
} from '@/lib/model/activity'
import { activitiesStore } from '@/lib/storage/activitiesStore'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, formatTime } from '@/lib/utils/date'

type ActivityEditorPageProps = {
  activityId: string
}

type Draft = {
  title: string
  description: string
  status: ActivityStatus
  progressMode: 'auto' | 'manual'
  progress: number
  subtasks: Subtask[]
  dueDate?: string
  priority: ActivityPriority
  project: string
}

function toDraft(activity?: Activity): Draft {
  return {
    title: activity?.title ?? '',
    description: activity?.description ?? '',
    status: activity?.status ?? 'todo',
    progressMode: activity?.progressMode ?? 'auto',
    progress: activity?.progress ?? 0,
    subtasks: activity?.subtasks ?? [],
    dueDate: activity?.dueDate,
    priority: activity?.priority ?? 'medium',
    project: activity?.project ?? '',
  }
}

function toActivity(draft: Draft, base?: Activity): Activity {
  const now = new Date().toISOString()
  return {
    id: base?.id ?? 'draft',
    createdAt: base?.createdAt ?? now,
    updatedAt: base?.updatedAt ?? now,
    completedAt: base?.completedAt,
    ...draft,
  }
}

function normalizeDraft(draft: Draft): Draft {
  return toDraft(normalizeActivity(toActivity(draft)))
}

function hasMessageContent(draft: Draft): boolean {
  return Boolean(draft.title.trim() || draft.description.trim() || draft.subtasks.length > 0)
}

export function ActivityEditorPage({ activityId }: ActivityEditorPageProps) {
  const isNew = activityId === 'nova'
  const initial = isNew ? undefined : activitiesStore.getById(activityId)

  const navigate = useNavigate()
  const notify = useToast()
  const allActivities = useActivities()

  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [missing, setMissing] = useState(!isNew && !initial)
  const [status, setStatus] = useState<'saved' | 'saving'>('saved')
  const [savedAt, setSavedAt] = useState<Date | null>(
    initial ? new Date(initial.updatedAt) : null,
  )
  const [subtaskInput, setSubtaskInput] = useState('')

  const persistedIdRef = useRef<string | null>(initial?.id ?? null)
  const dirtyRef = useRef(false)
  const firstRenderRef = useRef(true)
  const skipNextSaveRef = useRef(false)
  const draftRef = useRef(draft)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  draftRef.current = draft

  useDocumentTitle(draft.title.trim() || (isNew ? 'Nova atividade' : 'Atividade'))

  const projects = Array.from(
    new Set(
      [...allActivities.map((activity) => activity.project.trim()), draft.project.trim()].filter(
        Boolean,
      ),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const persist = useCallback(
    (navigateOnCreate: boolean, patch?: Partial<Draft>): string | null => {
      const value = normalizeDraft({ ...draftRef.current, ...patch })
      const payload = {
        title: value.title,
        description: value.description,
        status: value.status,
        progressMode: value.progressMode,
        progress: value.progress,
        subtasks: value.subtasks,
        dueDate: value.dueDate,
        priority: value.priority,
        project: value.project,
      }

      if (persistedIdRef.current) {
        activitiesStore.update(persistedIdRef.current, payload)
        return persistedIdRef.current
      }
      if (!hasMessageContent(value)) return null

      const created = activitiesStore.create(payload)
      persistedIdRef.current = created.id
      if (navigateOnCreate) navigate(`/atividade/${created.id}`, { replace: true })
      return created.id
    },
    [navigate],
  )

  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  useEffect(() => {
    if (activityId === 'nova' || activityId === persistedIdRef.current) return
    const activity = activitiesStore.getById(activityId)
    if (!activity) {
      setMissing(true)
      return
    }
    persistedIdRef.current = activity.id
    skipNextSaveRef.current = true
    setDraft(toDraft(activity))
    setMissing(false)
    setStatus('saved')
    setSavedAt(new Date(activity.updatedAt))
  }, [activityId])

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (!persistedIdRef.current && !hasMessageContent(draft)) {
      setStatus('saved')
      return
    }

    dirtyRef.current = true
    setStatus('saving')
    const timer = window.setTimeout(() => {
      persistRef.current(true)
      dirtyRef.current = false
      setStatus('saved')
      setSavedAt(new Date())
    }, 500)

    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    return () => {
      if (dirtyRef.current) persistRef.current(false)
    }
  }, [])

  useEffect(() => {
    const element = descriptionRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [draft.description])

  function updateDraft(patch: Partial<Draft>): void {
    setDraft((current) => normalizeDraft({ ...current, ...patch }))
  }

  function handleBack(): void {
    if (dirtyRef.current) persistRef.current(false)
    navigate('/atividades')
  }

  function handleStatus(nextStatus: ActivityStatus): void {
    setDraft((current) => normalizeDraft(changeActivityStatus(toActivity(current), nextStatus)))
  }

  function handleToggleSubtask(subtaskId: string): void {
    setDraft((current) =>
      normalizeDraft(toggleActivitySubtask(toActivity(current), subtaskId)),
    )
  }

  function handleSubtaskTitle(subtaskId: string, title: string): void {
    setDraft((current) => ({
      ...current,
      subtasks: current.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, title } : subtask,
      ),
    }))
  }

  function handleRemoveSubtask(subtaskId: string): void {
    setDraft((current) =>
      normalizeDraft({
        ...current,
        subtasks: current.subtasks.filter((subtask) => subtask.id !== subtaskId),
      }),
    )
  }

  function handleAddSubtask(): void {
    const title = subtaskInput.trim()
    if (!title) return
    if (draft.subtasks.length >= MAX_SUBTASKS) {
      notify(`Limite de ${MAX_SUBTASKS} subtarefas`)
      return
    }
    setSubtaskInput('')
    setDraft((current) =>
      normalizeDraft({
        ...current,
        subtasks: [...current.subtasks, { id: nanoid(8), title, done: false }],
      }),
    )
  }

  function handleDelete(): void {
    const id = persistedIdRef.current
    if (!id) {
      navigate('/atividades')
      return
    }
    const removed = activitiesStore.remove(id)
    navigate('/atividades')
    if (removed) {
      notify('Atividade excluída', {
        label: 'Desfazer',
        onClick: () => activitiesStore.restore(removed),
      })
    }
  }

  const doneSubtasks = subtaskDoneCount(draft.subtasks)
  const dueLabel = draft.dueDate ? activityDueLabel(toActivity(draft)) : null
  const overdue = draft.dueDate ? isActivityOverdue(toActivity(draft)) : false
  const saveLabel =
    status === 'saving'
      ? 'Salvando…'
      : savedAt
        ? `Salvo às ${formatTime(savedAt.toISOString())}`
        : 'Salvo'

  if (missing) {
    return (
      <div className="editor-page activity-editor-page">
        <header className="editor-bar">
          <div className="editor-bar-side">
            <IconButton icon="arrow-left" label="Voltar" onClick={() => navigate('/atividades')} />
          </div>
          <span className="editor-bar-title">Atividade</span>
          <div className="editor-bar-side" />
        </header>
        <EmptyState
          icon="target"
          title="Atividade não encontrada"
          description="Ela pode ter sido excluída ou o link está incompleto."
          action={
            <Button variant="primary" onClick={() => navigate('/atividades')}>
              Voltar para as atividades
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="editor-page activity-editor-page">
      <header className="editor-bar">
        <div className="editor-bar-side">
          <IconButton icon="arrow-left" label="Voltar para as atividades" onClick={handleBack} />
          <span className={cn('save-state', status === 'saving' && 'is-saving')} aria-live="polite">
            <Icon name={status === 'saving' ? 'clock' : 'check'} size={14} />
            <span className="save-label">{saveLabel}</span>
          </span>
        </div>

        <span className="editor-bar-title" aria-hidden="true">
          {isNew ? 'Nova atividade' : 'Atividade'}
        </span>

        <div className="editor-bar-side editor-bar-actions">
          <IconButton icon="trash" label="Excluir atividade" tone="danger" onClick={handleDelete} />
        </div>
      </header>

      <main className="activity-editor-canvas">
        <p className="eyebrow">{isNew ? 'Planejar' : 'Editar atividade'}</p>

        <input
          className="activity-editor-title"
          value={draft.title}
          maxLength={200}
          placeholder="O que precisa ser feito?"
          aria-label="Título da atividade"
          autoFocus={isNew}
          onChange={(event) => updateDraft({ title: event.target.value })}
        />

        <textarea
          ref={descriptionRef}
          className="activity-editor-desc"
          value={draft.description}
          placeholder="Detalhes, links, critérios de conclusão…"
          aria-label="Descrição da atividade"
          rows={1}
          onChange={(event) => updateDraft({ description: event.target.value })}
        />

        <section className="activity-panel">
          <div className="activity-panel-head">
            <h2>Etapa</h2>
            {draft.progressMode === 'auto' && draft.subtasks.length > 0 ? (
              <span className="panel-hint">acompanha as subtarefas</span>
            ) : null}
          </div>
          <div className="activity-status-options" role="radiogroup" aria-label="Status da atividade">
            {ACTIVITY_STATUSES.map((statusOption) => (
              <button
                key={statusOption}
                type="button"
                role="radio"
                aria-checked={draft.status === statusOption}
                className={cn(
                  'activity-status-option',
                  `activity-status-option--${statusOption}`,
                  draft.status === statusOption && 'is-active',
                )}
                onClick={() => handleStatus(statusOption)}
              >
                <span className={cn('status-dot', `status-dot--${statusOption}`)} />
                {ACTIVITY_STATUS_LABELS[statusOption]}
              </button>
            ))}
          </div>
        </section>

        <section className="activity-panel">
          <div className="activity-panel-head">
            <h2>Progresso</h2>
            <strong className="panel-value">{draft.progress}%</strong>
          </div>

          <div className="activity-bar activity-bar--large">
            <span style={{ width: `${draft.progress}%` }} />
          </div>

          <div className="progress-controls">
            <div className="segmented" role="group" aria-label="Como calcular o progresso">
              <button
                type="button"
                className={cn(draft.progressMode === 'auto' && 'is-active')}
                aria-pressed={draft.progressMode === 'auto'}
                onClick={() => updateDraft({ progressMode: 'auto' })}
              >
                Subtarefas
              </button>
              <button
                type="button"
                className={cn(draft.progressMode === 'manual' && 'is-active')}
                aria-pressed={draft.progressMode === 'manual'}
                onClick={() => updateDraft({ progressMode: 'manual' })}
              >
                Manual
              </button>
            </div>

            {draft.progressMode === 'manual' ? (
              <label className="progress-range">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.progress}
                  aria-label="Progresso manual"
                  onChange={(event) => updateDraft({ progress: Number(event.target.value) })}
                />
              </label>
            ) : (
              <span className="progress-note">
                {draft.subtasks.length > 0
                  ? `${doneSubtasks} de ${draft.subtasks.length} subtarefas concluídas`
                  : 'Sem subtarefas: 100% ao concluir.'}
              </span>
            )}
          </div>
        </section>

        <section className="activity-panel">
          <div className="activity-panel-head">
            <h2>Subtarefas</h2>
            {draft.subtasks.length > 0 ? (
              <span className="panel-hint">
                {doneSubtasks}/{draft.subtasks.length}
              </span>
            ) : null}
          </div>

          {draft.subtasks.length > 0 ? (
            <div className="subtask-list">
              {draft.subtasks.map((subtask) => (
                <div className="subtask-row" key={subtask.id}>
                  <button
                    type="button"
                    className={cn('subtask-check', subtask.done && 'is-done')}
                    aria-label={subtask.done ? 'Desmarcar subtarefa' : 'Concluir subtarefa'}
                    aria-pressed={subtask.done}
                    onClick={() => handleToggleSubtask(subtask.id)}
                  >
                    {subtask.done ? <Icon name="check" size={11} /> : null}
                  </button>
                  <input
                    className={cn('subtask-input', subtask.done && 'is-done')}
                    value={subtask.title}
                    maxLength={200}
                    aria-label="Título da subtarefa"
                    onChange={(event) => handleSubtaskTitle(subtask.id, event.target.value)}
                  />
                  <button
                    type="button"
                    className="subtask-remove"
                    aria-label="Remover subtarefa"
                    onClick={() => handleRemoveSubtask(subtask.id)}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-empty">
              Divida a atividade em passos menores para acompanhar o progresso automaticamente.
            </p>
          )}

          <form
            className="subtask-add"
            onSubmit={(event) => {
              event.preventDefault()
              handleAddSubtask()
            }}
          >
            <Icon name="plus" size={14} />
            <input
              value={subtaskInput}
              placeholder="Adicionar subtarefa…"
              aria-label="Nova subtarefa"
              maxLength={200}
              onChange={(event) => setSubtaskInput(event.target.value)}
            />
            <Button type="submit" variant="ghost" size="sm" disabled={!subtaskInput.trim()}>
              Adicionar
            </Button>
          </form>
        </section>

        <section className="activity-panel">
          <div className="activity-panel-head">
            <h2>Detalhes</h2>
          </div>

          <div className="activity-fields">
            <label className="field">
              <span>Prazo</span>
              <input
                type="date"
                value={draft.dueDate ?? ''}
                onChange={(event) => updateDraft({ dueDate: event.target.value || undefined })}
              />
              {dueLabel ? (
                <span className={cn('field-hint', overdue && 'is-overdue')}>{dueLabel}</span>
              ) : null}
            </label>

            <div className="field">
              <span>Prioridade</span>
              <div className="priority-options" role="radiogroup" aria-label="Prioridade">
                {ACTIVITY_PRIORITIES.map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    role="radio"
                    aria-checked={draft.priority === priority}
                    className={cn(
                      'priority-option',
                      `priority-option--${priority}`,
                      draft.priority === priority && 'is-active',
                    )}
                    onClick={() => updateDraft({ priority })}
                  >
                    <Icon name="flag" size={12} />
                    {ACTIVITY_PRIORITY_LABELS[priority]}
                  </button>
                ))}
              </div>
            </div>

            <label className="field field--wide">
              <span>Projeto</span>
              <input
                value={draft.project}
                list="activity-project-options"
                maxLength={60}
                placeholder="Casa, trabalho, estudos…"
                onChange={(event) => updateDraft({ project: event.target.value })}
              />
              <datalist id="activity-project-options">
                {projects.map((project) => (
                  <option value={project} key={project} />
                ))}
              </datalist>
            </label>
          </div>
        </section>

        <footer className="activity-editor-foot">
          <span>
            {initial
              ? `Criada em ${formatDateTime(initial.createdAt)}`
              : savedAt
                ? `Salva automaticamente às ${formatTime(savedAt.toISOString())}`
                : 'Ainda não salva'}
          </span>
          {initial?.completedAt ? (
            <span>· Concluída em {formatDateTime(initial.completedAt)}</span>
          ) : null}
        </footer>
      </main>
    </div>
  )
}
