import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { useNotes } from '@/hooks/useStores'
import { FONT_LABELS } from '@/lib/model/note'
import { buildShareLink, encodeSharePayload } from '@/lib/share/codec'
import { downloadBlob, noteFilename } from '@/lib/share/download'
import { buildNotePayload, buildNoteTransfer } from '@/lib/share/transfer'
import { MAX_SHARE_LINK_LENGTH, type NotePayload } from '@/lib/share/types'
import { formatBytes } from '@/lib/utils/date'

type ShareDialogProps = {
  open: boolean
  noteId: string | null
  onClose: () => void
}
type BuildStatus = 'idle' | 'building' | 'ready' | 'error'

export function ShareDialog({ open, noteId, onClose }: ShareDialogProps) {
  const notes = useNotes()
  const notify = useToast()
  const note = noteId ? notes.find((item) => item.id === noteId) : undefined
  const coverUrl = useCoverUrl(note?.coverImageId)

  const [status, setStatus] = useState<BuildStatus>('idle')
  const [link, setLink] = useState<string | null>(null)
  const [payload, setPayload] = useState<NotePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collabLink, setCollabLink] = useState<string | null>(null)
  const [collabStatus, setCollabStatus] = useState<'idle' | 'creating' | 'error'>('idle')
  const [collabError, setCollabError] = useState<string | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !note) return
    let cancelled = false

    setStatus('building')
    setLink(null)
    setPayload(null)
    setError(null)
    setCollabLink(null)
    setCollabStatus('idle')
    setCollabError(null)

    buildNotePayload(note)
      .then(async (built) => {
        const encoded = await encodeSharePayload(built)
        if (cancelled) return
        setPayload(built)
        setLink(buildShareLink(encoded))
        setStatus('ready')
      })
      .catch((buildError) => {
        if (cancelled) return
        console.error(buildError)
        setStatus('error')
        setError('Não foi possível preparar esta nota para compartilhar.')
      })

    return () => {
      cancelled = true
    }
  }, [open, note])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open || !note) return null

  const tooLong = Boolean(link && link.length > MAX_SHARE_LINK_LENGTH)
  const file = payload
    ? new File([JSON.stringify(payload)], noteFilename(note.title), {
        type: 'application/json',
      })
    : null
  const fileSize = payload ? new Blob([JSON.stringify(payload)]).size : 0
  const canWebShare = typeof navigator.share === 'function'

  async function copyLink(): Promise<void> {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      notify('Link copiado')
    } catch {
      const input = linkInputRef.current
      if (!input) {
        notify('Não foi possível copiar o link')
        return
      }
      input.focus()
      input.select()
      document.execCommand('copy')
      notify('Link copiado')
    }
  }

  async function createCollabLink(): Promise<void> {
    if (!note || collabStatus === 'creating') return
    setCollabStatus('creating')
    setCollabError(null)
    try {
      const transfer = await buildNoteTransfer(note)
      const { createCollaborativeInvite } = await import('@/lib/collaboration/notes')
      const token = await createCollaborativeInvite(transfer)
      const base = new URL(import.meta.env.BASE_URL, window.location.origin).href
      setCollabLink(`${base}#/colaborar/${token}`)
      setCollabStatus('idle')
    } catch (createError) {
      console.error(createError)
      setCollabStatus('error')
      setCollabError('Não foi possível criar o convite. Confira a configuração do Supabase.')
    }
  }

  async function copyCollabLink(): Promise<void> {
    if (!collabLink) return
    try {
      await navigator.clipboard.writeText(collabLink)
      notify('Link de colaboração copiado')
    } catch {
      notify('Não foi possível copiar o link')
    }
  }

  function downloadFile(): void {
    if (!file) return
    downloadBlob(file, file.name)
    notify('Arquivo gerado — envie para quem quiser')
  }

  async function share(): Promise<void> {
    if (!file) return
    try {
      if (canWebShare && link && !tooLong) {
        await navigator.share({
          title: note?.title || 'Nota do Caderno',
          text: 'Uma nota compartilhada pelo Caderno',
          url: link,
        })
        return
      }
      if (canWebShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: note?.title || 'Nota do Caderno' })
        return
      }
      if (link && !tooLong) {
        await copyLink()
      } else {
        downloadFile()
      }
    } catch (shareError) {
      if ((shareError as DOMException | undefined)?.name === 'AbortError') return
      notify('Não foi possível compartilhar')
    }
  }

  const title = note.title.trim() || 'Sem título'
  const initial = title.charAt(0).toUpperCase()

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="share-head">
          <div>
            <p className="eyebrow">Enviar para alguém</p>
            <h2 className="share-title" id="share-dialog-title">
              Compartilhar nota
            </h2>
          </div>
          <IconButton icon="x" label="Fechar compartilhamento" onClick={onClose} autoFocus />
        </header>

        <div className="share-preview">
          <div className="share-cover">
            {coverUrl ? (
              <img src={coverUrl} alt="" />
            ) : (
              <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)' }}>
                {initial}
              </span>
            )}
          </div>
          <div className="share-preview-info">
            <strong>{title}</strong>
            <span>
              {FONT_LABELS[note.fontFamily]}
              {note.tags.length > 0 ? ` · ${note.tags.slice(0, 2).join(', ')}` : ''}
            </span>
          </div>
        </div>

        {status === 'building' ? (
          <p className="share-status">Preparando o link…</p>
        ) : status === 'error' ? (
          <p className="share-error">{error}</p>
        ) : (
          <>
            <label className="share-link-row">
              <span className="sr-only">Link para compartilhar</span>
              <input
                ref={linkInputRef}
                className="share-link-input"
                readOnly
                value={link ?? ''}
                onFocus={(event) => event.target.select()}
              />
            </label>

            {tooLong ? (
              <p className="share-warning">
                <Icon name="image" size={15} />
                Esta nota tem imagem e o link ficaria com {(link?.length ?? 0).toLocaleString(
                  'pt-BR',
                )}{' '}
                caracteres. Aplicativos de mensagem podem cortar — prefira o arquivo.
              </p>
            ) : (
              <p className="share-hint">
                O link carrega o conteúdo da nota. Quem abrir vê uma prévia e importa uma cópia
                editável.
              </p>
            )}

            <div className="share-actions">
              {tooLong ? (
                <Button variant="primary" icon="download" onClick={downloadFile}>
                  Baixar arquivo
                </Button>
              ) : (
                <Button variant="primary" icon="copy" onClick={() => void copyLink()}>
                  Copiar link
                </Button>
              )}
              {canWebShare ? (
                <Button
                  variant="secondary"
                  icon="share"
                  onClick={() => void share()}
                  disabled={!file}
                >
                  Compartilhar…
                </Button>
              ) : null}
            </div>

            <section className="collab-share">
              <div>
                <strong>Editar em conjunto</strong>
                <p>Quem tiver o convite poderá editar título e conteúdo em tempo real.</p>
              </div>
              {collabLink ? (
                <>
                  <input className="share-link-input" readOnly value={collabLink} onFocus={(event) => event.target.select()} aria-label="Link para edição colaborativa" />
                  <Button variant="primary" icon="copy" onClick={() => void copyCollabLink()}>Copiar convite</Button>
                </>
              ) : (
                <Button variant="secondary" icon="share" onClick={() => void createCollabLink()} disabled={collabStatus === 'creating'}>
                  {collabStatus === 'creating' ? 'Criando convite…' : 'Criar convite de colaboração'}
                </Button>
              )}
              {collabError ? <p className="share-error">{collabError}</p> : null}
            </section>

            <div className="share-file-row">
              {tooLong ? null : (
                <Button variant="ghost" icon="download" size="sm" onClick={downloadFile}>
                  Baixar arquivo .json
                </Button>
              )}
              <span className="share-file-size">
                {formatBytes(fileSize)} · imagem incluída quando existe
              </span>
            </div>
          </>
        )}

        <p className="share-foot">O link comum contém uma cópia. O convite colaborativo guarda a nota no Supabase para sincronizar as edições.</p>
      </div>
    </div>
  )
}
