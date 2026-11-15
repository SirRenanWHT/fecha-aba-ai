import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { FONT_STACKS, type CardTheme, type FontFamily, type Note } from '@/lib/model/note'
import { cleanupCoverLater } from '@/lib/storage/coverCleanup'
import { createCoverImage } from '@/lib/storage/imageStore'
import { notesStore } from '@/lib/storage/notesStore'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, formatTime } from '@/lib/utils/date'
import { htmlToText, normalizeNoteHtml } from '@/lib/utils/html'
import { ShareDialog } from '@/features/sharing/ShareDialog'
import { RichTextEditor } from './RichTextEditor'
import { StylePanel } from './StylePanel'

type NoteEditorPageProps = {
  noteId: string
}

type Draft = {
  title: string
  content: string
  tags: string[]
  fontFamily: FontFamily
  accentColor: string
  cardTheme: CardTheme
  coverImageId?: string
}

const MAX_TAGS = 20

function toDraft(note?: Note): Draft {
  return {
    title: note?.title ?? '',
    content: note?.content ?? '',
    tags: note?.tags ?? [],
    fontFamily: note?.fontFamily ?? 'inter',
    accentColor: note?.accentColor ?? '#b0492b',
    cardTheme: note?.cardTheme ?? 'auto',
    coverImageId: note?.coverImageId,
  }
}

function hasDraftContent(draft: Draft): boolean {
  return Boolean(
    draft.title.trim() ||
      htmlToText(draft.content) ||
      draft.tags.length > 0 ||
      draft.coverImageId,
  )
}

export function NoteEditorPage({ noteId }: NoteEditorPageProps) {
  const isNew = noteId === 'nova'
  const initialNote = isNew ? undefined : notesStore.getById(noteId)

  const navigate = useNavigate()
  const notify = useToast()

  const [draft, setDraft] = useState<Draft>(() => toDraft(initialNote))
  const [pinned, setPinned] = useState(initialNote?.pinned ?? false)
  const [tagInput, setTagInput] = useState('')
  const [status, setStatus] = useState<'saved' | 'saving'>('saved')
  const [savedAt, setSavedAt] = useState<Date | null>(
    initialNote ? new Date(initialNote.updatedAt) : null,
  )
  const [missing, setMissing] = useState(!isNew && !initialNote)
  const [panelOpen, setPanelOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  const persistedIdRef = useRef<string | null>(initialNote?.id ?? null)
  const dirtyRef = useRef(false)
  const firstRenderRef = useRef(true)
  const skipNextSaveRef = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const coverUrl = useCoverUrl(draft.coverImageId)

  useDocumentTitle(draft.title.trim() || (isNew ? 'Nova nota' : 'Nota'))

  const persist = useCallback(
    (navigateOnCreate: boolean, patch?: Partial<Draft>): string | null => {
      const value = { ...draftRef.current, ...patch }
      const payload = {
        title: value.title,
        content: normalizeNoteHtml(value.content),
        tags: value.tags,
        fontFamily: value.fontFamily,
        accentColor: value.accentColor,
        cardTheme: value.cardTheme,
        coverImageId: value.coverImageId,
        pinned,
      }

      if (persistedIdRef.current) {
        notesStore.update(persistedIdRef.current, payload)
        return persistedIdRef.current
      }
      if (!hasDraftContent(value)) return null

      const created = notesStore.create(payload)
      persistedIdRef.current = created.id
      if (navigateOnCreate) navigate(`/nota/${created.id}`, { replace: true })
      return created.id
    },
    [pinned, navigate],
  )

  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  // Carrega outra nota caso a URL mude sem desmontar o componente.
  useEffect(() => {
    if (noteId === 'nova' || noteId === persistedIdRef.current) return
    const note = notesStore.getById(noteId)
    if (!note) {
      setMissing(true)
      return
    }
    persistedIdRef.current = note.id
    skipNextSaveRef.current = true
    setDraft(toDraft(note))
    setPinned(note.pinned)
    setMissing(false)
    setStatus('saved')
    setSavedAt(new Date(note.updatedAt))
  }, [noteId])

  // Salvamento automático com pequeno atraso.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (!persistedIdRef.current && !hasDraftContent(draft)) {
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

  // Salva o que estiver pendente ao sair da tela.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) persistRef.current(false)
    }
  }, [])

  function updateDraft(patch: Partial<Draft>): void {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function handleBack(): void {
    if (dirtyRef.current) persistRef.current(false)
    navigate('/')
  }

  function handlePin(): void {
    const id = persist(true)
    if (!id) return
    const updated = notesStore.togglePin(id)
    if (!updated) return
    setPinned(updated.pinned)
    setStatus('saved')
    setSavedAt(new Date())
  }

  function handleShare(): void {
    const id = persist(true)
    if (!id) {
      notify('Escreva algo antes de compartilhar')
      return
    }
    setShareOpen(true)
  }

  function handleArchive(): void {
    const id = persist(true)
    if (!id) {
      navigate('/')
      return
    }
    notesStore.update(id, { archived: true })
    navigate('/')
    notify('Nota arquivada', {
      label: 'Desfazer',
      onClick: () => {
        notesStore.update(id, { archived: false })
        notify('Nota restaurada')
      },
    })
  }

  function handleDelete(): void {
    const id = persistedIdRef.current
    if (!id) {
      navigate('/')
      return
    }
    const removed = notesStore.remove(id)
    navigate('/')
    if (removed) {
      cleanupCoverLater(removed.coverImageId, 8000)
      notify('Nota excluída', {
        label: 'Desfazer',
        onClick: () => notesStore.restore(removed),
      })
    }
  }

  function addTag(raw: string): void {
    const value = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
    if (!value) return
    if (draft.tags.includes(value)) {
      setTagInput('')
      return
    }
    if (draft.tags.length >= MAX_TAGS) {
      notify(`Limite de ${MAX_TAGS} tags por nota`)
      return
    }
    updateDraft({ tags: [...draft.tags, value.slice(0, 40)] })
    setTagInput('')
  }

  function removeTag(tag: string): void {
    updateDraft({ tags: draft.tags.filter((item) => item !== tag) })
  }

  async function handlePickCover(file: File): Promise<void> {
    if (uploadingCover) return
    setUploadingCover(true)
    try {
      const previous = draftRef.current.coverImageId
      const image = await createCoverImage(file)
      updateDraft({ coverImageId: image.id })
      const id = persist(true, { coverImageId: image.id })
      if (id) {
        setStatus('saved')
        setSavedAt(new Date())
      }
      if (previous) cleanupCoverLater(previous, 2500)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível usar essa imagem')
    } finally {
      setUploadingCover(false)
    }
  }

  function handleRemoveCover(): void {
    const previous = draftRef.current.coverImageId
    updateDraft({ coverImageId: undefined })
    persist(true, { coverImageId: undefined })
    if (previous) cleanupCoverLater(previous, 2500)
  }

  const plainText = htmlToText(draft.content)
  const words = plainText ? plainText.split(/\s+/).length : 0
  const saveLabel =
    status === 'saving'
      ? 'Salvando…'
      : savedAt
        ? `Salvo às ${formatTime(savedAt.toISOString())}`
        : 'Salvo'

  if (missing) {
    return (
      <div className="editor-page">
        <header className="editor-bar">
          <div className="editor-bar-side">
            <IconButton icon="arrow-left" label="Voltar" onClick={() => navigate('/')} />
          </div>
          <span className="editor-bar-title">Nota</span>
          <div className="editor-bar-side" />
        </header>
        <EmptyState
          icon="note"
          title="Nota não encontrada"
          description="Ela pode ter sido excluída ou o link está incompleto."
          action={
            <Button variant="primary" onClick={() => navigate('/')}>
              Voltar para as notas
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="editor-page" data-note-font={draft.fontFamily}>
      <header className="editor-bar">
        <div className="editor-bar-side">
          <IconButton icon="arrow-left" label="Voltar para as notas" onClick={handleBack} />
          <span className={cn('save-state', status === 'saving' && 'is-saving')} aria-live="polite">
            <Icon name={status === 'saving' ? 'clock' : 'check'} size={14} />
            <span className="save-label">{saveLabel}</span>
          </span>
        </div>

        <span className="editor-bar-title" aria-hidden="true">
          {isNew ? 'Nova nota' : 'Nota'}
        </span>

        <div className="editor-bar-side editor-bar-actions">
          <IconButton icon="share" label="Compartilhar nota" onClick={handleShare} />
          <IconButton
            icon="palette"
            label="Personalizar nota"
            active={panelOpen}
            onClick={() => setPanelOpen(true)}
          />
          <IconButton
            icon="pin"
            label={pinned ? 'Desafixar nota' : 'Fixar nota'}
            active={pinned}
            filled={pinned}
            onClick={handlePin}
          />
          <IconButton icon="archive" label="Arquivar nota" onClick={handleArchive} />
          <span className="bar-divider" aria-hidden="true" />
          <IconButton icon="trash" label="Excluir nota" tone="danger" onClick={handleDelete} />
        </div>
      </header>

      <main
        className="editor-canvas"
        data-card-theme={draft.cardTheme}
        style={{ ['--note-accent' as string]: draft.accentColor }}
      >
        {coverUrl ? (
          <div className="editor-cover">
            <img src={coverUrl} alt="Capa da nota" />
            <button
              type="button"
              className="editor-cover-edit"
              onClick={() => setPanelOpen(true)}
            >
              <Icon name="image" size={14} />
              Trocar capa
            </button>
          </div>
        ) : null}

        <input
          className="editor-title"
          value={draft.title}
          maxLength={200}
          placeholder="Título da nota"
          aria-label="Título da nota"
          autoFocus={isNew}
          style={{ fontFamily: FONT_STACKS[draft.fontFamily] }}
          onChange={(event) => updateDraft({ title: event.target.value })}
        />

        <div className="editor-meta">
          <span className="editor-date">
            <Icon name="clock" size={14} />
            {savedAt ? `Editada em ${formatDateTime(savedAt.toISOString())}` : 'Ainda não salva'}
          </span>

          <div className="editor-tags">
            {draft.tags.map((tag) => (
              <span className="editor-tag" key={tag}>
                {tag}
                <button
                  type="button"
                  className="editor-tag-remove"
                  aria-label={`Remover tag ${tag}`}
                  onClick={() => removeTag(tag)}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
            <label className="tag-add">
              <Icon name="plus" size={11} />
              <input
                className="tag-input"
                value={tagInput}
                placeholder={draft.tags.length === 0 ? 'adicionar tag…' : 'mais tags…'}
                aria-label="Adicionar tag"
                onChange={(event) => setTagInput(event.target.value)}
                onBlur={() => addTag(tagInput)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault()
                    addTag(tagInput)
                  }
                  if (event.key === 'Backspace' && !tagInput && draft.tags.length > 0) {
                    removeTag(draft.tags[draft.tags.length - 1])
                  }
                }}
              />
            </label>
          </div>
        </div>

        <div className="editor-rule" aria-hidden="true" />

        <RichTextEditor
          value={draft.content}
          fontFamily={draft.fontFamily}
          placeholder="Comece a escrever…"
          onChange={(html) => updateDraft({ content: html })}
        />

        <footer className="editor-foot">
          {words} {words === 1 ? 'palavra' : 'palavras'} · {plainText.length}{' '}
          {plainText.length === 1 ? 'caractere' : 'caracteres'}
        </footer>
      </main>

      <StylePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        fontFamily={draft.fontFamily}
        accentColor={draft.accentColor}
        cardTheme={draft.cardTheme}
        coverUrl={coverUrl}
        uploadingCover={uploadingCover}
        onChangeFont={(fontFamily) => updateDraft({ fontFamily })}
        onChangeAccent={(accentColor) => updateDraft({ accentColor })}
        onChangeTheme={(cardTheme) => updateDraft({ cardTheme })}
        onPickCover={(file) => {
          void handlePickCover(file)
        }}
        onRemoveCover={handleRemoveCover}
      />

      <ShareDialog
        open={shareOpen}
        noteId={persistedIdRef.current}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}
