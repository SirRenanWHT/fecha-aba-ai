import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import type { RestoreMode } from '@/lib/share/transfer'
import { cn } from '@/lib/utils/cn'
import { formatDateTime } from '@/lib/utils/date'

type BackupSummary = {
  notes: number
  images: number
  activities?: number
  createdAt: string
  version?: string
}

type ImportBackupDialogProps = {
  open: boolean
  summary: BackupSummary | null
  busy: boolean
  onCancel: () => void
  onConfirm: (mode: RestoreMode) => void
}

export function ImportBackupDialog({
  open,
  summary,
  busy,
  onCancel,
  onConfirm,
}: ImportBackupDialogProps) {
  const [mode, setMode] = useState<RestoreMode>('merge')

  useEffect(() => {
    if (open) setMode('merge')
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, busy, onCancel])

  if (!open || !summary) return null

  const activitiesCount = summary.activities ?? 0

  return (
    <div className="dialog-backdrop" onClick={() => (!busy ? onCancel() : undefined)}>
      <div
        className="dialog backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title" id="backup-dialog-title">
          Restaurar backup
        </h2>
        <p className="dialog-description">
          {summary.notes} {summary.notes === 1 ? 'nota' : 'notas'} · {summary.images}{' '}
          {summary.images === 1 ? 'imagem de capa' : 'imagens de capa'} · {activitiesCount}{' '}
          {activitiesCount === 1 ? 'atividade' : 'atividades'} · gerado em{' '}
          {formatDateTime(summary.createdAt)}
          {summary.version ? ` · versão ${summary.version}` : ''}.
        </p>

        <div className="backup-modes" role="radiogroup" aria-label="Como restaurar">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'merge'}
            className={cn('backup-mode', mode === 'merge' && 'is-active')}
            onClick={() => setMode('merge')}
          >
            <span className="backup-mode-icon">
              <Icon name="layers" size={18} />
            </span>
            <span className="backup-mode-text">
              <strong>Mesclar</strong>
              <span>Adiciona as notas do backup como cópias. Nada é apagado.</span>
            </span>
            <span className="backup-mode-check" aria-hidden="true">
              {mode === 'merge' ? <Icon name="check" size={15} /> : null}
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={mode === 'replace'}
            className={cn('backup-mode', mode === 'replace' && 'is-active is-danger')}
            onClick={() => setMode('replace')}
          >
            <span className="backup-mode-icon">
              <Icon name="trash" size={18} />
            </span>
            <span className="backup-mode-text">
              <strong>Substituir tudo</strong>
              <span>Apaga as notas e imagens atuais antes de restaurar. Não dá para desfazer.</span>
            </span>
            <span className="backup-mode-check" aria-hidden="true">
              {mode === 'replace' ? <Icon name="check" size={15} /> : null}
            </span>
          </button>
        </div>

        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={mode === 'replace' ? 'danger' : 'primary'}
            onClick={() => onConfirm(mode)}
            disabled={busy}
          >
            {busy ? 'Restaurando…' : mode === 'replace' ? 'Substituir e restaurar' : 'Mesclar backup'}
          </Button>
        </div>
      </div>
    </div>
  )
}
