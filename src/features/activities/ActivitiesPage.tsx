import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useActivities } from '@/hooks/useStores'
import {
  ACTIVITY_STATUS_LABELS,
  changeActivityStatus,
  isActivityOverdue,
  type Activity,
  type ActivityStatus,
} from '@/lib/model/activity'
import { activitiesFilename, downloadBlob } from '@/lib/share/download'
import { buildActivitiesPayload, importActivitiesPayload } from '@/lib/share/transfer'
import { sharePayloadSchema, type ActivitiesPayload } from '@/lib/share/types'
import { activitiesStore } from '@/lib/storage/activitiesStore'
import { getCollaborativeActivityRoom, isCollaborativeActivity } from '@/lib/collaboration/activity-links'
import { cn } from '@/lib/utils/cn'
import { ActivityRow } from './ActivityRow'
import { KanbanCard } from './KanbanCard'

type ViewMode = 'list' | 'kanban'
type ActivityFilter = 'all' | ActivityStatus | 'overdue'
type SourceFilter = 'all' | 'personal' | 'shared'

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'todo', label: 'A fazer' },
  { value: 'doing', label: 'Em andamento' },
  { value: 'done', label: 'Concluídas' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'overdue', label: 'Atrasadas' },
]
const SOURCE_FILTERS: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'personal', label: 'Pessoais' },
  { value: 'shared', label: 'Compartilhadas' },
]

const KANBAN_COLUMNS: ActivityStatus[] = ['todo', 'doing', 'paused', 'done']

const STATUS_RANK: Record<ActivityStatus, number> = {
  doing: 0,
  todo: 1,
  paused: 2,
  done: 3,
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

function compareActivities(a: Activity, b: Activity): number {
  if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status]
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate && !b.dueDate) return -1
  if (!a.dueDate && b.dueDate) return 1
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  return b.updatedAt.localeCompare(a.updatedAt)
}

export function ActivitiesPage() {
  useDocumentTitle('Atividades')

  const activities = useActivities()
  const navigate = useNavigate()
  const notify = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const kanbanRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<ActivitiesPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    let stopRealtime: (() => void) | undefined
    void Promise.all([
      import('@/lib/collaboration/activities'),
      import('@/lib/collaboration/supabase'),
    ]).then(([collaboration, supabaseModule]) => {
      if (cancelled) return
      const { syncSharedActivityRooms } = collaboration
      const { supabase } = supabaseModule
      void syncSharedActivityRooms().catch((error) => {
        console.warn('Não foi possível atualizar as atividades compartilhadas', error)
      })
      const channel = supabase.channel('shared-activities-index')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'collab_activities',
        }, () => {
          void syncSharedActivityRooms().catch((error) => {
            console.warn('Não foi possível atualizar as atividades compartilhadas', error)
          })
        })
        .subscribe()
      stopRealtime = () => { void supabase.removeChannel(channel) }
      const refresh = () => {
        if (document.visibilityState === 'hidden') return
        void syncSharedActivityRooms().catch((error) => console.warn('Não foi possível atualizar as atividades compartilhadas', error))
      }
      window.addEventListener('focus', refresh)
      window.addEventListener('pageshow', refresh)
      document.addEventListener('visibilitychange', refresh)
      const removeRefresh = () => {
        window.removeEventListener('focus', refresh)
        window.removeEventListener('pageshow', refresh)
        document.removeEventListener('visibilitychange', refresh)
      }
      const removeRealtime = stopRealtime
      stopRealtime = () => { removeRefresh(); removeRealtime?.() }
    }).catch((error) => {
      console.warn('Não foi possível iniciar a sincronização de atividades', error)
    })
    return () => {
      cancelled = true
      stopRealtime?.()
    }
  }, [])

  const sourceActivities = useMemo(() => activities.filter((activity) => {
    const shared = isCollaborativeActivity(activity)
    return sourceFilter === 'all' || (sourceFilter === 'shared' ? shared : !shared)
  }), [activities, sourceFilter])

  const counts = useMemo(
    () => ({
      all: sourceActivities.length,
      todo: sourceActivities.filter((activity) => activity.status === 'todo').length,
      doing: sourceActivities.filter((activity) => activity.status === 'doing').length,
      done: sourceActivities.filter((activity) => activity.status === 'done').length,
      paused: sourceActivities.filter((activity) => activity.status === 'paused').length,
      overdue: sourceActivities.filter(isActivityOverdue).length,
    }),
    [sourceActivities],
  )

  const projects = useMemo(() => {
    const names = new Set<string>()
    for (const activity of sourceActivities) {
      const project = activity.project.trim()
      if (project) names.add(project)
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [sourceActivities])

  const filtered = useMemo(
    () =>
      sourceActivities
        .filter((activity) => {
          if (projectFilter && activity.project.trim() !== projectFilter) return false
          if (filter === 'overdue') return isActivityOverdue(activity)
          if (filter !== 'all' && activity.status !== filter) return false
          return true
        })
        .sort(compareActivities),
    [sourceActivities, filter, projectFilter],
  )

  const kanbanItems = useMemo(
    () =>
      sourceActivities
        .filter((activity) => !projectFilter || activity.project.trim() === projectFilter)
        .sort(compareActivities),
    [sourceActivities, projectFilter],
  )

  const completedPercent =
    counts.all > 0 ? Math.round((counts.done / counts.all) * 100) : 0

  useEffect(() => {
    const container = tabsRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!active) return
    container.scrollTo({
      left: active.offsetLeft - container.clientWidth / 2 + active.clientWidth / 2,
      behavior: 'smooth',
    })
  }, [filter, sourceFilter, view])

  function openActivity(id: string): void {
    navigate(`/atividade/${id}`)
  }

  function newActivity(): void {
    navigate('/atividade/nova')
  }

  function clearFilters(): void {
    setFilter('all')
    setSourceFilter('all')
    setProjectFilter(null)
  }

  function handleViewChange(next: ViewMode): void {
    setView(next)
    if (next === 'kanban') setFilter('all')
  }

  function updateStatus(activity: Activity, status: ActivityStatus): void {
    const room = activity.collaborationRoom ?? getCollaborativeActivityRoom(activity.id)
    if (!room) {
      activitiesStore.changeStatus(activity.id, status)
      return
    }

    const updated = activitiesStore.update(
      activity.id,
      changeActivityStatus(activity, status),
      { generateRecurrence: false },
    )
    if (!updated) return
    void import('@/lib/collaboration/activities').then(({ saveCollaborativeActivity }) =>
      saveCollaborativeActivity(room, updated),
    ).catch((error) => {
      console.error('Não foi possível salvar a atividade compartilhada', error)
      activitiesStore.update(activity.id, activity, { generateRecurrence: false })
      notify('Não foi possível atualizar a atividade compartilhada')
    })
  }

  function handleToggleDone(activity: Activity): void {
    updateStatus(activity, activity.status === 'done' ? 'doing' : 'done')
  }

  function handleMove(id: string, status: ActivityStatus): void {
    const activity = activitiesStore.getById(id)
    if (activity) updateStatus(activity, status)
    window.requestAnimationFrame(() => {
      const board = kanbanRef.current
      const column = board?.querySelector<HTMLElement>(`[data-status="${status}"]`)
      if (!board || !column) return
      board.scrollTo({ left: Math.max(0, column.offsetLeft - 10), behavior: 'smooth' })
    })
  }

  function handleExport(): void {
    if (activities.length === 0) {
      notify('Não há atividades para exportar')
      return
    }
    const payload = buildActivitiesPayload()
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    downloadBlob(blob, activitiesFilename())
    notify(`${activities.length} ${activities.length === 1 ? 'atividade exportada' : 'atividades exportadas'}`)
  }

  async function handleFile(file: File): Promise<void> {
    try {
      const text = await file.text()
      const parsed = sharePayloadSchema.safeParse(JSON.parse(text) as unknown)
      if (!parsed.success) {
        notify('Este arquivo não foi gerado pelo Caderno')
        return
      }
      if (parsed.data.kind === 'note' || parsed.data.kind === 'backup') {
        notify('Esse arquivo é de notas. Importe na lista de Notas ou em Ajustes.')
        return
      }
      setPendingImport(parsed.data)
    } catch {
      notify('Não foi possível ler o arquivo')
    }
  }

  function confirmImport(): void {
    if (!pendingImport) return
    const imported = importActivitiesPayload(pendingImport)
    setPendingImport(null)
    notify(`${imported} ${imported === 1 ? 'atividade importada' : 'atividades importadas'}`)
  }

  return (
    <div className="page activities-page">
      <header className="page-head">
        <div className="page-heading">
          <p className="eyebrow">Acompanhe</p>
          <h1 className="page-title">Atividades</h1>
          <p className="page-sub">
            {counts.all} {counts.all === 1 ? 'atividade' : 'atividades'} · {counts.done}{' '}
            {counts.done === 1 ? 'concluída' : 'concluídas'}
          </p>
        </div>

        <div className="page-tools activity-tools">
          <Button
            variant="secondary"
            icon="download"
            className="activity-icon-btn"
            aria-label="Importar atividades"
            title="Importar atividades"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="activity-btn-label">Importar</span>
          </Button>
          <Button
            variant="secondary"
            icon="upload"
            className="activity-icon-btn"
            aria-label="Exportar atividades"
            title="Exportar atividades"
            onClick={handleExport}
          >
            <span className="activity-btn-label">Exportar</span>
          </Button>
          <Button
            variant="primary"
            icon="plus"
            className="new-activity-btn"
            onClick={newActivity}
          >
            Nova atividade
          </Button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleFile(file)
        }}
      />

      {activities.length === 0 ? (
        <EmptyState
          icon="target"
          title="Nenhuma atividade ainda"
          description="Programe o que precisa acontecer, divida em subtarefas e acompanhe o progresso até concluir."
          action={
            <div className="empty-actions">
              <Button variant="primary" icon="plus" onClick={newActivity}>
                Criar primeira atividade
              </Button>
              <Button
                variant="secondary"
                icon="download"
                onClick={() => fileInputRef.current?.click()}
              >
                Importar atividades
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <section className="activity-summary">
            <div className="summary-head">
              <div>
                <p className="eyebrow">Visão geral</p>
                <h2>
                  {counts.done} de {counts.all} concluídas
                </h2>
              </div>
              <span className="summary-percent">{completedPercent}%</span>
            </div>
            <div className="summary-bar">
              <span style={{ width: `${completedPercent}%` }} />
            </div>
            <div className="summary-stats">
              <div>
                <strong>{counts.doing}</strong>
                <span>Em andamento</span>
              </div>
              <div>
                <strong>{counts.todo}</strong>
                <span>A fazer</span>
              </div>
              <div>
                <strong>{counts.paused}</strong>
                <span>Pausadas</span>
              </div>
              <div className={counts.overdue > 0 ? 'is-alert' : undefined}>
                <strong>{counts.overdue}</strong>
                <span>Atrasadas</span>
              </div>
              <div>
                <strong>{counts.done}</strong>
                <span>Concluídas</span>
              </div>
            </div>
          </section>

          <div className="activity-toolbar">
            <div className="view-switch" role="group" aria-label="Visualização das atividades">
              <button
                type="button"
                className={cn(view === 'list' && 'is-active')}
                aria-pressed={view === 'list'}
                onClick={() => handleViewChange('list')}
              >
                <Icon name="list" size={15} />
                Lista
              </button>
              <button
                type="button"
                className={cn(view === 'kanban' && 'is-active')}
                aria-pressed={view === 'kanban'}
                onClick={() => handleViewChange('kanban')}
              >
                <Icon name="layers" size={15} />
                Kanban
              </button>
            </div>

            {view === 'list' ? (
              <div
                className="tabs tabs--scroll"
                role="tablist"
                aria-label="Filtrar atividades"
                ref={tabsRef}
              >
                {FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === item.value}
                    className={cn('tab', filter === item.value && 'is-active')}
                    onClick={() => setFilter(item.value)}
                  >
                    {item.label}
                    <span className="tab-count">{counts[item.value]}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="activity-hint">
                Deslize para ver as etapas e mude pelo seletor do card.
              </span>
            )}
          </div>

          <div className="tabs" role="tablist" aria-label="Origem das atividades">
            {SOURCE_FILTERS.map((item) => {
              const amount = item.value === 'all'
                ? activities.length
                : activities.filter((activity) => isCollaborativeActivity(activity) === (item.value === 'shared')).length
              return (
                <button key={item.value} type="button" role="tab"
                  aria-selected={sourceFilter === item.value}
                  className={cn('tab', sourceFilter === item.value && 'is-active')}
                  onClick={() => setSourceFilter(item.value)}>
                  {item.label}<span className="tab-count">{amount}</span>
                </button>
              )
            })}
          </div>

          {projects.length > 0 ? (
            <div className="tag-filter activity-projects" aria-label="Filtrar por projeto">
              {projects.map((project) => (
                <button
                  key={project}
                  type="button"
                  className={cn('tag-chip', projectFilter === project && 'is-active')}
                  aria-pressed={projectFilter === project}
                  onClick={() => setProjectFilter(projectFilter === project ? null : project)}
                >
                  {project}
                </button>
              ))}
            </div>
          ) : null}

          {view === 'list' ? (
            filtered.length === 0 ? (
              <EmptyState
                icon="search"
                title="Nada com esses filtros"
                description="Tente outra etapa, outro projeto ou limpe os filtros para ver todas as atividades."
                action={
                  <Button variant="secondary" icon="x" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <div className="activity-list">
                {filtered.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    onOpen={openActivity}
                    onToggleDone={handleToggleDone}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="kanban-board" ref={kanbanRef}>
              {KANBAN_COLUMNS.map((status) => {
                const items = kanbanItems.filter((activity) => activity.status === status)
                return (
                  <section className="kanban-column" key={status} data-status={status}>
                    <header className="kanban-head">
                      <span className={cn('status-dot', `status-dot--${status}`)} />
                      <h3>{ACTIVITY_STATUS_LABELS[status]}</h3>
                      <span className="kanban-count">{items.length}</span>
                    </header>
                    <div className="kanban-list">
                      {items.map((activity) => (
                        <KanbanCard
                          key={activity.id}
                          activity={activity}
                          onOpen={openActivity}
                          onMove={handleMove}
                        />
                      ))}
                      {items.length === 0 ? (
                        <p className="kanban-empty">Nenhuma atividade nesta etapa.</p>
                      ) : null}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}

      <button type="button" className="fab" aria-label="Nova atividade" onClick={newActivity}>
        <Icon name="plus" size={24} />
      </button>

      <ConfirmDialog
        open={pendingImport !== null}
        title="Importar atividades?"
        description={
          pendingImport
            ? `${pendingImport.activities.length} ${
                pendingImport.activities.length === 1 ? 'atividade será adicionada' : 'atividades serão adicionadas'
              } como cópias, com prazos, prioridades e subtarefas.`
            : undefined
        }
        confirmLabel="Importar"
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
      />
    </div>
  )
}
