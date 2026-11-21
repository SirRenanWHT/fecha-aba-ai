import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Y from 'yjs'
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
import { activitySchema } from '@/lib/model/activity'
import { SupabaseYjsProvider } from '@/lib/collaboration/provider'
import { saveCollaborativeActivity, syncSharedActivityRooms } from '@/lib/collaboration/activities'
import { supabase } from '@/lib/collaboration/supabase'
import { ActivityCollaborationActions } from './ActivityCollaborationActions'

type ActivityEditorPageProps = {
  activityId: string
  collaborationRoom?: string
}

type Draft = {
  title: string
  description: string
  status: ActivityStatus
  progressMode: 'auto' | 'manual'
  progress: number
  subtasks: Subtask[]
  dueDate?: string
  recurrence?: Activity['recurrence']
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
    recurrence: activity?.recurrence,
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

function changedDraftFields(from: Draft, to: Draft): Partial<Draft> {
  const changes: Partial<Draft> = {}
  for (const key of Object.keys(to) as Array<keyof Draft>) {
    if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
      Object.assign(changes, { [key]: to[key] })
    }
  }
  return changes
}

function hasMessageContent(draft: Draft): boolean {
  return Boolean(draft.title.trim() || draft.description.trim() || draft.subtasks.length > 0)
}

export function ActivityEditorPage({ activityId, collaborationRoom }: ActivityEditorPageProps) {
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
  const persistedDraftRef = useRef(toDraft(initial))
  const sharedDraftRef = useRef(toDraft(initial))
  const dirtyRef = useRef(false)
  const firstRenderRef = useRef(true)
  const skipNextSaveRef = useRef(false)
  const draftRef = useRef(draft)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const collaborationDocRef = useRef<Y.Doc | null>(null)
  const skipCollaborationSaveRef = useRef(false)
  const [collaborationStatus, setCollaborationStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
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
      const current = draftRef.current
      const changes = changedDraftFields(persistedDraftRef.current, current)
      const latest = persistedIdRef.current
        ? activitiesStore.getById(persistedIdRef.current)
        : undefined
      const value = normalizeDraft({ ...toDraft(latest), ...changes, ...patch })
      const payload = {
        title: value.title,
        description: value.description,
        status: value.status,
        progressMode: value.progressMode,
        progress: value.progress,
        subtasks: value.subtasks,
        dueDate: value.dueDate,
        recurrence: value.recurrence,
        priority: value.priority,
        project: value.project,
      }

      if (persistedIdRef.current) {
        const updated = activitiesStore.update(
          persistedIdRef.current,
          payload,
          { generateRecurrence: !collaborationRoom },
        )
        if (updated) persistedDraftRef.current = toDraft(updated)
        return persistedIdRef.current
      }
      if (!hasMessageContent(value)) return null

      const created = activitiesStore.create(payload)
      persistedIdRef.current = created.id
      persistedDraftRef.current = toDraft(created)
      if (navigateOnCreate) navigate(`/atividade/${created.id}`, { replace: true })
      return created.id
    },
    [collaborationRoom, navigate],
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
    persistedDraftRef.current = toDraft(activity)
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

  useEffect(() => {
    if (!collaborationRoom || !initial) return
    const doc = new Y.Doc()
    const provider = new SupabaseYjsProvider(collaborationRoom, doc, false)
    const shared = doc.getMap<unknown>('activity')
    collaborationDocRef.current = doc

    const applySharedActivity = () => {
      if (shared.size === 0) return
      const parsed = activitySchema.safeParse(Object.fromEntries(shared.entries()))
      if (!parsed.success) return
      const current = activitiesStore.getById(activityId)
      if (!current) return
      const updated = activitiesStore.update(activityId, {
        ...parsed.data,
        id: activityId,
      }, { generateRecurrence: false })
      if (!updated) return
      const remoteDraft = toDraft(updated)
      const pendingLocalChanges = changedDraftFields(persistedDraftRef.current, draftRef.current)
      persistedDraftRef.current = remoteDraft
      sharedDraftRef.current = remoteDraft
      skipNextSaveRef.current = Object.keys(pendingLocalChanges).length === 0
      skipCollaborationSaveRef.current = Object.keys(pendingLocalChanges).length === 0
      setDraft({ ...remoteDraft, ...pendingLocalChanges })
    }
    shared.observe(applySharedActivity)

    const stopStatus = provider.onStatus((next) => {
      if (next === 'error') setCollaborationStatus('error')
      else if (next === 'connected') {
        setCollaborationStatus('connected')
        if (shared.size === 0) {
          const current = activitiesStore.getById(activityId)
          if (current) doc.transact(() => {
            for (const [key, value] of Object.entries(current)) shared.set(key, value)
          })
          if (current) sharedDraftRef.current = toDraft(current)
        } else applySharedActivity()
      } else setCollaborationStatus('connecting')
    })

    return () => {
      stopStatus()
      shared.unobserve(applySharedActivity)
      collaborationDocRef.current = null
      provider.destroy()
      doc.destroy()
    }
  }, [activityId, collaborationRoom])

  useEffect(() => {
    if (!collaborationRoom) return
    const channel = supabase.channel(`shared-activity-index:${collaborationRoom}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'collab_activities',
        filter: `document_id=eq.${collaborationRoom}`,
      }, ({ new: row }) => {
        const remote = activitySchema.safeParse(row.activity)
        const shared = collaborationDocRef.current?.getMap<unknown>('activity')
        if (remote.success && shared) {
          collaborationDocRef.current?.transact(() => {
            for (const [key, value] of Object.entries(remote.data)) {
              if (JSON.stringify(shared.get(key)) !== JSON.stringify(value)) shared.set(key, value)
            }
          })
        }
        void syncSharedActivityRooms().catch((error) => {
          console.warn('Não foi possível atualizar a próxima atividade recorrente', error)
        })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [collaborationRoom])

  useEffect(() => {
    if (!collaborationRoom || !initial) return
    if (skipCollaborationSaveRef.current) {
      skipCollaborationSaveRef.current = false
      return
    }
    const changes = changedDraftFields(sharedDraftRef.current, draft)
    if (Object.keys(changes).length === 0) return
    const timer = window.setTimeout(() => {
      const current = activitiesStore.getById(activityId)
      const doc = collaborationDocRef.current
      if (!current || !doc || collaborationStatus !== 'connected') return
      const updated = activitiesStore.update(activityId, changes, { generateRecurrence: false })
      if (!updated) return
      const shared = doc.getMap<unknown>('activity')
      doc.transact(() => {
        for (const [key, value] of Object.entries(updated)) {
          if (JSON.stringify(shared.get(key)) !== JSON.stringify(value)) shared.set(key, value)
        }
      })
      sharedDraftRef.current = toDraft(updated)
      persistedDraftRef.current = toDraft(updated)
      void saveCollaborativeActivity(collaborationRoom, updated).catch((error) => {
        console.error('Não foi possível salvar a atividade compartilhada', error)
        setCollaborationStatus('error')
      })
    }, 600)
    return () => window.clearTimeout(timer)
  }, [activityId, collaborationRoom, collaborationStatus, draft])

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
          {collaborationRoom ? (
            <span className={cn('save-state', collaborationStatus === 'connected' ? '' : 'is-saving')}>
              <Icon name={collaborationStatus === 'connected' ? 'check' : 'clock'} size={14} />
              <span className="save-label">{collaborationStatus === 'connected' ? 'Em tempo real' : collaborationStatus === 'error' ? 'Sem conexão' : 'Conectando…'}</span>
            </span>
          ) : null}
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

        {!isNew && !collaborationRoom ? (
          <ActivityCollaborationActions activity={activitiesStore.getById(activityId) ?? toActivity(draft)} />
        ) : null}

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
                onChange={(event) => {
                  const dueDate = event.target.value || undefined
                  updateDraft({
                    dueDate,
                    recurrence: dueDate && draft.recurrence
                      ? { ...draft.recurrence, dayOfMonth: Number(dueDate.slice(-2)) }
                      : draft.recurrence,
                  })
                }}
              />
              {dueLabel ? (
                <span className={cn('field-hint', overdue && 'is-overdue')}>{dueLabel}</span>
              ) : null}
            </label>

            <label className="field recurrence-field">
                <span>Recorrência</span>
                <span className="recurrence-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.recurrence)}
                    disabled={!draft.dueDate}
                    onChange={(event) => updateDraft({
                      recurrence: event.target.checked && draft.dueDate
                        ? {
                            frequency: 'monthly',
                            dayOfMonth: Number(draft.dueDate.slice(-2)),
                            seriesId: draft.recurrence?.seriesId ?? nanoid(12),
                          }
                        : undefined,
                    })}
                  />
                  Repetir mensalmente
                </span>
                <span className="field-hint">
                  A próxima atividade será criada ao concluir esta. Em meses curtos, o prazo cai no último dia.
                </span>
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
