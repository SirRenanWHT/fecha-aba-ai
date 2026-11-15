import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { FONT_LABELS, FONT_STACKS, type Note } from '@/lib/model/note'
import { decodeSharePayload } from '@/lib/share/codec'
import { importNoteTransfer } from '@/lib/share/transfer'
import { sharePayloadSchema, type NotePayload } from '@/lib/share/types'
import { cn } from '@/lib/utils/cn'
import { sanitizeNoteHtml } from '@/lib/utils/html'

type ImportState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: NotePayload }
  | { status: 'backup' }
  | { status: 'activities' }

export function ImportPage() {
  useDocumentTitle('Importar nota')

  const [searchParams] = useSearchParams()
  const encoded = searchParams.get('d')
  const navigate = useNavigate()
  const notify = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<ImportState>(
    encoded ? { status: 'loading' } : { status: 'empty' },
  )
  const [importing, setImporting] = useState(false)
  const [contentTruncated, setContentTruncated] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!encoded) {
      setState({ status: 'empty' })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    decodeSharePayload(encoded)
      .then((payload) => {
        if (cancelled) return
        if (payload.kind === 'backup') {
          setState({ status: 'backup' })
          return
        }
        if (payload.kind === 'activities') {
          setState({ status: 'activities' })
          return
        }
        setState({ status: 'ready', payload })
      })
      .catch((decodeError: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message:
            decodeError instanceof Error
              ? decodeError.message
              : 'Não foi possível ler este link.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [encoded])

  useEffect(() => {
    if (state.status !== 'ready') {
      setContentTruncated(false)
      return
    }
    const element = contentRef.current
    if (!element) return
    const frame = window.requestAnimationFrame(() => {
      setContentTruncated(element.scrollHeight > element.clientHeight + 4)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [state])

  async function handleFile(file: File): Promise<void> {    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const result = sharePayloadSchema.safeParse(parsed)
      if (!result.success) {
        notify('Este arquivo não foi gerado pelo Caderno')
        return
      }
      if (result.data.kind === 'backup') {
        notify('Backup completo: importe em Ajustes → Importar backup')
        return
      }
      if (result.data.kind === 'activities') {
        notify('Arquivo de atividades: importe na área de Atividades')
        return
      }
      setState({ status: 'ready', payload: result.data })
    } catch {
      notify('Não foi possível ler o arquivo')
    }
  }

  async function handleImport(payload: NotePayload): Promise<void> {
    setImporting(true)
    try {
      const created = await importNoteTransfer(payload.note)
      notify('Nota importada para o seu caderno')
      navigate(`/nota/${created.id}`)
    } catch (error) {
      console.error(error)
      notify('Não foi possível importar esta nota')
    } finally {
      setImporting(false)
    }
  }

  const preview: Note | null = state.status === 'ready' ? state.payload.note.note : null
  const cover =
    state.status === 'ready' && state.payload.note.cover
      ? `data:${state.payload.note.cover.mime};base64,${state.payload.note.cover.data}`
      : null

  return (
    <div className="editor-page import-page">
      <header className="editor-bar">
        <div className="editor-bar-side">
          <IconButton icon="arrow-left" label="Voltar para as notas" onClick={() => navigate('/')} />
        </div>
        <span className="editor-bar-title">Importar nota</span>
        <div className="editor-bar-side" />
      </header>

      <main className="import-canvas">
        {state.status === 'loading' ? (
          <p className="import-loading">
            <Icon name="clock" size={16} />
            Lendo o conteúdo do link…
          </p>
        ) : state.status === 'ready' && preview ? (
          <>
            <p className="eyebrow">Uma nota chegou</p>
            <h1 className="import-title">Importar para o Caderno?</h1>
            <p className="import-sub">
              Você verá uma prévia. A nota é adicionada como uma cópia editável, com as fontes,
              cores e capa originais.
            </p>

            <article
              className="import-card"
              data-note-font={preview.fontFamily}
              data-card-theme={preview.cardTheme}
              style={{ ['--note-font' as string]: FONT_STACKS[preview.fontFamily] }}
            >
              {cover ? (
                <div className="import-cover">
                  <img src={cover} alt="Capa da nota" />
                </div>
              ) : null}
              <div className="import-card-body">
                <div className="import-meta">
                  <span>{FONT_LABELS[preview.fontFamily]}</span>
                  {preview.tags.map((tag) => (
                    <span className="tag-pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="import-card-title">{preview.title.trim() || 'Sem título'}</h2>
                <div
                  ref={contentRef}
                  className={cn('import-content', contentTruncated && 'is-truncated')}
                  // Conteúdo validado pelo schema e sanitizado antes de renderizar.
                  dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(preview.content) }}
                />
              </div>
            </article>

            <div className="import-actions">
              <Button
                variant="primary"
                icon="download"
                disabled={importing}
                onClick={() => void handleImport(state.payload)}
              >
                {importing ? 'Importando…' : 'Importar para o meu caderno'}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Agora não
              </Button>
            </div>
          </>
        ) : state.status === 'activities' ? (
          <EmptyState
            icon="activity"
            title="Este arquivo é de atividades"
            description="Abra a área de Atividades e use o botão Importar para adicionar as atividades ao seu quadro."
            action={
              <Button variant="primary" onClick={() => navigate('/atividades')}>
                Ir para Atividades
              </Button>
            }
          />
        ) : state.status === 'backup' ? (
          <EmptyState
            icon="layers"
            title="Este link é um backup completo"
            description="Backups com todas as notas e imagens devem ser restaurados em Ajustes → Importar backup."
            action={
              <Button variant="primary" onClick={() => navigate('/ajustes')}>
                Ir para Ajustes
              </Button>
            }
          />
        ) : state.status === 'error' ? (
          <EmptyState
            icon="note"
            title="Não foi possível abrir este link"
            description={state.message}
            action={
              <Button variant="primary" icon="download" onClick={() => fileInputRef.current?.click()}>
                Escolher um arquivo
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="note"
            title="Importar uma nota"
            description="Selecione o arquivo .caderno.json exportado de uma nota ou abra um link de compartilhamento. Você verá uma prévia antes de adicionar."
            action={
              <Button variant="primary" icon="download" onClick={() => fileInputRef.current?.click()}>
                Escolher arquivo .json
              </Button>
            }
          />
        )}

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

        <p className="import-foot">
          <Icon name="check" size={13} />
          Nada é enviado para servidores — o conteúdo chega dentro do próprio link ou arquivo.
        </p>
      </main>
    </div>
  )
}
