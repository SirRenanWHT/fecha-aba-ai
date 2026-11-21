import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import { Button, IconButton } from '@/components/Button'
import { HCaptchaChallenge } from '@/components/HCaptchaChallenge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { FONT_STACKS, type Note } from '@/lib/model/note'
import { notesStore } from '@/lib/storage/notesStore'
import { htmlToText } from '@/lib/utils/html'
import { coverTransform } from '@/lib/utils/cover'
import { COLLAB_EDITOR_EXTENSIONS, joinCollaborativeInvite, openCollaborativeNoteRoom } from '@/lib/collaboration/notes'
import { SupabaseYjsProvider } from '@/lib/collaboration/provider'
import * as Y from 'yjs'
import { useToast } from '@/components/Toast'

type Session = { room: string; note: Note; doc: Y.Doc; provider: SupabaseYjsProvider }
type Status = 'loading' | 'connecting' | 'connected' | 'error'

export function CollaborativeNotePage({ room }: { room?: string } = {}) {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const notify = useToast()
  const [note, setNote] = useState<Note | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [captchaVisible, setCaptchaVisible] = useState(false)
  const [captchaMessage, setCaptchaMessage] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [title, setTitle] = useState('')
  const sessionRef = useRef<Session | null>(null)
  const openInviteRef = useRef<(captchaToken?: string) => void>(() => undefined)

  const editor = useEditor(
    {
      extensions: session && status === 'connected'
        ? [
            ...COLLAB_EDITOR_EXTENSIONS,
            Placeholder.configure({ placeholder: 'Comece a escrever…' }),
            Collaboration.configure({ document: session.doc, field: 'prosemirror' }),
          ]
        : COLLAB_EDITOR_EXTENSIONS,
      editorProps: { attributes: { class: 'rte-content editor-body collab-content' } },
      onUpdate: ({ editor: current }) => {
        if (!session) return
        const updated = notesStore.update(session.note.id, { content: current.getHTML() })
        if (updated) setNote(updated)
      },
    },
    [session?.doc, status],
  )

  const coverUrl = useCoverUrl(note?.coverImageId)
  useDocumentTitle(note?.title.trim() || 'Nota colaborativa')

  useEffect(() => {
    let cancelled = false
    let activeProvider: SupabaseYjsProvider | null = null
    let activeDoc: Y.Doc | null = null
    let stopStatus: (() => void) | null = null

    async function open(captchaToken?: string): Promise<void> {
      setStatus('loading')
      setError('')
      setCaptchaMessage('')
      setCaptchaVisible(false)
      try {
        const joined = room
          ? await openCollaborativeNoteRoom(room, captchaToken)
          : await joinCollaborativeInvite(token, captchaToken)
        if (cancelled) return

        const doc = new Y.Doc()
        const provider = new SupabaseYjsProvider(joined.room, doc)
        activeDoc = doc
        activeProvider = provider
        const next: Session = { ...joined, doc, provider }
        sessionRef.current = next
        setNote(joined.note)
        setTitle(doc.getText('title').toString())
        setSession(next)
        setStatus(provider.getStatus() === 'connected' ? 'connected' : 'connecting')
        stopStatus = provider.onStatus((nextStatus) => {
          if (cancelled) return
          if (nextStatus === 'connected') setStatus('connected')
          else if (nextStatus === 'error') {
            setStatus('error')
            setError('Não foi possível conectar ou salvar esta nota no Supabase.')
          } else setStatus('connecting')
        })

        const titleText = doc.getText('title')
        const updateTitle = () => {
          const value = titleText.toString()
          setTitle(value)
          const updated = notesStore.update(joined.note.id, { title: value })
          if (updated) setNote(updated)
        }
        titleText.observe(updateTitle)
        updateTitle()
        sessionRef.current = { ...next, provider }
      } catch (openError) {
        if (cancelled) return
        console.error(openError)
        const details = openError instanceof Error ? openError.message : ''
        const code = typeof openError === 'object' && openError !== null && 'code' in openError
          ? String(openError.code)
          : ''
        if (/captcha/i.test(`${code} ${details}`)) {
          setCaptchaMessage('A verificação hCaptcha falhou ou expirou. Faça o desafio novamente.')
          setCaptchaVisible(true)
          setCaptchaResetKey((current) => current + 1)
          setStatus('loading')
          return
        }
        setError(
          details
            ? details
            : 'Não foi possível abrir este convite.',
        )
        setStatus('error')
      }
    }

    openInviteRef.current = (captchaToken) => { void open(captchaToken) }
    async function prepareInvite(): Promise<void> {
      try {
        const { hasSupabaseSession, HCAPTCHA_SITE_KEY } = await import('@/lib/collaboration/supabase')
        if (await hasSupabaseSession()) {
          await open()
        } else if (HCAPTCHA_SITE_KEY) {
          setCaptchaVisible(true)
          setStatus('loading')
        } else {
          setError('A Sitekey pública do hCaptcha não está configurada no app.')
          setStatus('error')
        }
      } catch (prepareError) {
        if (cancelled) return
        setError(prepareError instanceof Error ? prepareError.message : 'Não foi possível iniciar a conexão.')
        setStatus('error')
      }
    }
    void prepareInvite()
    return () => {
      cancelled = true
      stopStatus?.()
      activeProvider?.destroy()
      activeDoc?.destroy()
      sessionRef.current = null
    }
  }, [token, room])

  function changeTitle(value: string): void {
    setTitle(value)
    const current = sessionRef.current
    if (!current) return
    const titleText = current.doc.getText('title')
    current.doc.transact(() => {
      titleText.delete(0, titleText.length)
      titleText.insert(0, value)
    })
    const updated = notesStore.update(current.note.id, { title: value })
    if (updated) setNote(updated)
  }

  function runToolbar(action: (current: NonNullable<typeof editor>) => void): void {
    if (!editor) return
    action(editor)
  }

  if (status === 'loading') {
    return (
      <div className="editor-page collab-page">
        <header className="editor-bar">
          <div className="editor-bar-side">
            <IconButton icon="arrow-left" label="Voltar para as notas" onClick={() => navigate('/')} />
          </div>
          <span className="editor-bar-title">Nota compartilhada</span>
          <div className="editor-bar-side" />
        </header>
        {captchaVisible ? (
          <div className="collab-captcha-panel">
            <p>Para abrir esta nota, confirme que você é uma pessoa:</p>
            <HCaptchaChallenge
              resetKey={captchaResetKey}
              onVerify={(captchaToken) => openInviteRef.current(captchaToken)}
              onExpire={() => setCaptchaMessage('O desafio hCaptcha expirou. Faça a verificação novamente.')}
              onError={(message) => setCaptchaMessage(`hCaptcha: ${message}`)}
            />
            {captchaMessage ? <p className="share-error">{captchaMessage}</p> : null}
          </div>
        ) : (
          <p className="collab-message"><Icon name="clock" size={16} /> Entrando na nota compartilhada…</p>
        )}
      </div>
    )
  }

  if (status === 'error' || !note) {
    return (
      <div className="editor-page collab-page">
        <header className="editor-bar">
          <div className="editor-bar-side">
            <IconButton icon="arrow-left" label="Voltar para as notas" onClick={() => navigate('/')} />
          </div>
          <span className="editor-bar-title">Nota compartilhada</span>
          <div className="editor-bar-side" />
        </header>
        <EmptyState
          icon="note"
          title="Não foi possível abrir o convite"
          description={error || 'O link pode ter sido revogado ou estar incompleto.'}
          action={<Button variant="primary" onClick={() => navigate('/')}>Voltar para as notas</Button>}
        />
      </div>
    )
  }

  const plainText = editor ? htmlToText(editor.getHTML()) : ''
  const statusText = status === 'connected' ? 'Sincronizado' : 'Conectando…'

  return (
    <div className="editor-page collab-page" data-note-font={note.fontFamily}>
      <header className="editor-bar">
        <div className="editor-bar-side">
          <IconButton icon="arrow-left" label="Voltar para as notas" onClick={() => navigate('/')} />
          <span className={status === 'connected' ? 'save-state' : 'save-state is-saving'}>
            <Icon name={status === 'connected' ? 'check' : 'clock'} size={14} />
            <span className="save-label">{statusText}</span>
          </span>
        </div>
        <span className="editor-bar-title">Editando em conjunto</span>
        <div className="editor-bar-side editor-bar-actions">
          <Button variant="ghost" size="sm" icon="share" onClick={() => {
            void navigator.clipboard.writeText(window.location.href)
              .then(() => notify('Link do convite copiado'))
              .catch(() => notify('Não foi possível copiar o link'))
          }}>Convidar</Button>
        </div>
      </header>

      <main className="editor-canvas" data-card-theme={note.cardTheme} style={{ ['--note-accent' as string]: note.accentColor }}>
        {coverUrl ? (
          <div className="editor-cover">
            <img
              src={coverUrl}
              alt="Capa da nota"
              style={{
                objectPosition: `${note.coverPositionX}% ${note.coverPositionY}%`,
                transform: coverTransform(note.coverPositionX, note.coverPositionY, note.coverZoom),
              }}
            />
          </div>
        ) : null}
        <input
          className="editor-title"
          value={title}
          maxLength={200}
          placeholder="Título da nota"
          aria-label="Título da nota"
          style={{ fontFamily: FONT_STACKS[note.fontFamily] }}
          onChange={(event) => changeTitle(event.target.value)}
        />
        <p className="collab-caption">As alterações de título e conteúdo aparecem para todos em tempo real.</p>
        <div className="editor-rule" aria-hidden="true" />

        {editor && status === 'connected' ? (
          <div className="rte">
            <div className="rte-toolbar" role="toolbar" aria-label="Formatação do texto">
              <button type="button" className={`rte-button ${editor.isActive('bold') ? 'is-active' : ''}`} aria-label="Negrito" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleBold().run()) }}><span className="rte-glyph rte-glyph--bold">B</span></button>
              <button type="button" className={`rte-button ${editor.isActive('italic') ? 'is-active' : ''}`} aria-label="Itálico" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleItalic().run()) }}><span className="rte-glyph rte-glyph--italic">I</span></button>
              <button type="button" className={`rte-button ${editor.isActive('underline') ? 'is-active' : ''}`} aria-label="Sublinhado" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleUnderline().run()) }}><span className="rte-glyph rte-glyph--underline">U</span></button>
              <button type="button" className={`rte-button ${editor.isActive('strike') ? 'is-active' : ''}`} aria-label="Riscado" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleStrike().run()) }}><span className="rte-glyph rte-glyph--strike">S</span></button>
              <span className="rte-divider" />
              <button type="button" className={`rte-button ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`} aria-label="Título grande" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleHeading({ level: 2 }).run()) }}><span className="rte-glyph">H2</span></button>
              <button type="button" className={`rte-button ${editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}`} aria-label="Subtítulo" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleHeading({ level: 3 }).run()) }}><span className="rte-glyph">H3</span></button>
              <span className="rte-divider" />
              <button type="button" className={`rte-button ${editor.isActive('bulletList') ? 'is-active' : ''}`} aria-label="Lista com marcadores" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleBulletList().run()) }}><Icon name="list" size={17} /></button>
              <button type="button" className={`rte-button ${editor.isActive('orderedList') ? 'is-active' : ''}`} aria-label="Lista numerada" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleOrderedList().run()) }}><Icon name="list-ordered" size={17} /></button>
              <button type="button" className={`rte-button ${editor.isActive('taskList') ? 'is-active' : ''}`} aria-label="Lista de checkboxes" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleTaskList().run()) }}><Icon name="check-square" size={17} /></button>
              <button type="button" className={`rte-button ${editor.isActive('blockquote') ? 'is-active' : ''}`} aria-label="Citação" onMouseDown={(event) => { event.preventDefault(); runToolbar((current) => current.chain().focus().toggleBlockquote().run()) }}><Icon name="quote" size={17} /></button>
              <button type="button" className="rte-button" aria-label="Inserir link" onMouseDown={(event) => { event.preventDefault(); const href = window.prompt('Endereço do link:', 'https://'); if (href) runToolbar((current) => current.chain().focus().setLink({ href }).run()) }}><Icon name="link" size={17} /></button>
            </div>
            <EditorContent editor={editor} />
          </div>
        ) : <p className="collab-message"><Icon name="clock" size={16} /> Preparando o editor…</p>}

        <footer className="editor-foot">{plainText ? plainText.split(/\s+/).length : 0} palavras · {plainText.length} caracteres</footer>
      </main>
    </div>
  )
}

