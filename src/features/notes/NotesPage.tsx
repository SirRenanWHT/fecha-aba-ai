import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useNotes } from '@/hooks/useStores'
import type { Note } from '@/lib/model/note'
import { notesStore } from '@/lib/storage/notesStore'
import { cn } from '@/lib/utils/cn'
import { htmlToText } from '@/lib/utils/html'
import { NoteCard } from './NoteCard'

type FilterTab = 'all' | 'pinned' | 'archived'

const TABS: Array<{ value: FilterTab; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pinned', label: 'Fixadas' },
  { value: 'archived', label: 'Arquivadas' },
]

export function NotesPage() {
  useDocumentTitle('Notas')

  const notes = useNotes()
  const navigate = useNavigate()
  const notify = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<FilterTab>('all')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const deferredQuery = useDeferredValue(query)

  const counts = useMemo(
    () => ({
      all: notes.filter((note) => !note.archived).length,
      pinned: notes.filter((note) => note.pinned && !note.archived).length,
      archived: notes.filter((note) => note.archived).length,
    }),
    [notes],
  )

  const tags = useMemo(() => {
    const counter = new Map<string, number>()
    for (const note of notes) {
      if (note.archived) continue
      for (const tag of note.tags) counter.set(tag, (counter.get(tag) ?? 0) + 1)
    }
    return [...counter.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'),
    )
  }, [notes])

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase('pt-BR')
    return notes
      .filter((note) => {
        if (tab === 'archived' ? !note.archived : note.archived) return false
        if (tab === 'pinned' && !note.pinned) return false
        if (selectedTags.length > 0 && !selectedTags.every((tag) => note.tags.includes(tag))) {
          return false
        }
        if (!needle) return true
        const haystack = `${note.title}\n${htmlToText(note.content)}\n${note.tags.join(' ')}`.toLocaleLowerCase(
          'pt-BR',
        )
        return haystack.includes(needle)
      })
      .sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
      )
  }, [notes, tab, selectedTags, deferredQuery])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const isFiltering = query.trim().length > 0 || selectedTags.length > 0

  function toggleTag(tag: string): void {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    )
  }

  function clearFilters(): void {
    setQuery('')
    setSelectedTags([])
    setTab('all')
  }

  function handleTogglePin(note: Note): void {
    const updated = notesStore.togglePin(note.id)
    if (updated) {
      notify(updated.pinned ? 'Nota fixada no topo' : 'Nota desafixada')
    }
  }

  return (
    <div className="page notes-page">
      <header className="page-head">
        <div className="page-heading">
          <p className="eyebrow">Seu caderno</p>
          <h1 className="page-title">Notas</h1>
          <p className="page-sub">
            {counts.all} {counts.all === 1 ? 'nota ativa' : 'notas ativas'}
            {counts.pinned > 0
              ? ` · ${counts.pinned} ${counts.pinned === 1 ? 'fixada' : 'fixadas'}`
              : ''}
          </p>
        </div>

        <div className="page-tools">
          <label className="search-field">
            <Icon name="search" size={18} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Buscar notas e tags…"
              aria-label="Buscar notas"
              title="Atalho: /"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Limpar busca"
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
              >
                <Icon name="x" size={15} />
              </button>
            ) : null}
          </label>

          <Button
            variant="secondary"
            icon="download"
            className="import-note-btn"
            onClick={() => navigate('/importar')}
          >
            <span className="import-note-label">Importar</span>
          </Button>

          <Button
            variant="primary"
            icon="plus"
            className="new-note-btn"
            onClick={() => navigate('/nota/nova')}
          >
            Nova nota
          </Button>
        </div>
      </header>

      <div className="notes-toolbar">
        <div className="tabs" role="tablist" aria-label="Filtrar notas">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              className={cn('tab', tab === item.value && 'is-active')}
              onClick={() => setTab(item.value)}
            >
              {item.label}
              <span className="tab-count">{counts[item.value]}</span>
            </button>
          ))}
        </div>

        {tags.length > 0 ? (
          <div className="tag-filter" aria-label="Filtrar por tag">
            {tags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                className={cn('tag-chip', selectedTags.includes(tag) && 'is-active')}
                aria-pressed={selectedTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <span className="tag-count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon="note"
          title="Seu caderno está em branco"
          description="Comece com uma ideia, uma lista ou um projeto. Tudo fica salvo neste aparelho."
          action={
            <div className="empty-actions">
              <Button variant="primary" icon="plus" onClick={() => navigate('/nota/nova')}>
                Criar primeira nota
              </Button>
              <Button
                variant="secondary"
                icon="upload"
                onClick={() => navigate('/importar')}
              >
                Importar nota
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title={isFiltering ? 'Nada encontrado' : tab === 'archived' ? 'Nada arquivado' : 'Nenhuma nota fixada'}
          description={
            isFiltering
              ? 'Tente outro termo ou remova os filtros ativos.'
              : tab === 'archived'
                ? 'Quando você arquivar uma nota, ela aparece aqui — fora da lista principal, mas sempre à mão.'
                : 'Fixe as notas importantes para encontrá-las no topo da lista.'
          }
          action={
            isFiltering ? (
              <Button variant="secondary" icon="x" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : tab !== 'all' ? (
              <Button variant="secondary" onClick={() => setTab('all')}>
                Ver todas as notas
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="notes-grid">
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}

      <button
        type="button"
        className="fab"
        aria-label="Nova nota"
        onClick={() => navigate('/nota/nova')}
      >
        <Icon name="plus" size={24} />
      </button>
    </div>
  )
}
