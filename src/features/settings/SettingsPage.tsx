import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon, type IconName } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { APP_NAME, APP_PHASE, APP_VERSION } from '@/config'
import { ImportBackupDialog } from '@/features/sharing/ImportBackupDialog'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { useActivities, useNotes, useSettings } from '@/hooks/useStores'
import { backupFilename, downloadBlob } from '@/lib/share/download'
import {
  buildBackupPayload,
  countBackupActivities,
  countBackupImages,
  restoreBackup,
  type RestoreMode,
} from '@/lib/share/transfer'
import { sharePayloadSchema, type BackupPayload } from '@/lib/share/types'
import { imagesStats, clearImages } from '@/lib/storage/imageStore'
import { clearAllData, storageUsageBytes } from '@/lib/storage/storage'
import { settingsStore, type ThemePreference } from '@/lib/storage/settingsStore'
import { cn } from '@/lib/utils/cn'
import { formatBytes } from '@/lib/utils/date'

const HCaptchaChallenge = lazy(() => import('@/components/HCaptchaChallenge').then((module) => ({ default: module.HCaptchaChallenge })))

const THEME_CARDS: Array<{
  value: ThemePreference
  label: string
  description: string
  icon: IconName
}> = [
  { value: 'light', label: 'Claro', description: 'Papel quente', icon: 'sun' },
  { value: 'dark', label: 'Escuro', description: 'Para a noite', icon: 'moon' },
  { value: 'system', label: 'Sistema', description: 'Segue o aparelho', icon: 'monitor' },
]

export function SettingsPage() {
  useDocumentTitle('Ajustes')

  const notes = useNotes()
  const activities = useActivities()
  const settings = useSettings()
  const installPrompt = useInstallPrompt()
  const notify = useToast()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const [images, setImages] = useState<{ count: number; bytes: number } | null>(null)
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null)
  const [pendingBackup, setPendingBackup] = useState<BackupPayload | null>(null)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  )
  const [pushCaptchaVisible, setPushCaptchaVisible] = useState(false)
  const [pushCaptchaResetKey, setPushCaptchaResetKey] = useState(0)
  const [pushError, setPushError] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const usage = storageUsageBytes()

  useEffect(() => {
    let cancelled = false
    imagesStats()
      .then((stats) => {
        if (!cancelled) setImages(stats)
      })
      .catch(() => {
        if (!cancelled) setImages(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const archived = notes.filter((note) => note.archived).length

  async function handleReset(): Promise<void> {
    try {
      const { disableDeadlinePush } = await import('@/lib/collaboration/push')
      await disableDeadlinePush()
    } catch (error) {
      console.error('Não foi possível remover a inscrição push', error)
    }
    clearAllData()
    try {
      await clearImages()
    } catch (error) {
      console.error('Não foi possível limpar as imagens', error)
    }
    window.location.reload()
  }

  async function handleExportBackup(): Promise<void> {
    setBackupBusy('export')
    try {
      const payload = await buildBackupPayload(notes)
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      downloadBlob(blob, backupFilename())
      const activityCount = payload.activities?.length ?? 0
      notify(`Backup gerado com ${notes.length} notas e ${activityCount} atividades`)
    } catch (error) {
      console.error(error)
      notify('Não foi possível gerar o backup')
    } finally {
      setBackupBusy(null)
    }
  }

  async function handleBackupFile(file: File): Promise<void> {
    setBackupBusy('import')
    try {
      const text = await file.text()
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(text)
      } catch {
        notify('O arquivo não é um JSON válido')
        return
      }

      const result = sharePayloadSchema.safeParse(parsedJson)
      if (!result.success) {
        notify('Este arquivo não é um backup do Caderno')
        return
      }

      if (result.data.kind === 'activities') {
        notify('Esse arquivo é de atividades. Importe na área de Atividades.')
        return
      }

      if (result.data.kind === 'note') {
        notify('Esse arquivo é uma nota. Use “Importar nota” para ver a prévia.')
        return
      }

      setPendingBackup(result.data)
      setBackupDialogOpen(true)
    } catch (error) {
      console.error(error)
      notify('Não foi possível ler o backup')
    } finally {
      setBackupBusy(null)
    }
  }

  async function handleRestoreBackup(mode: RestoreMode): Promise<void> {
    if (!pendingBackup) return
    setBackupBusy('import')
    try {
      const restored = await restoreBackup(pendingBackup, mode)
      setBackupDialogOpen(false)
      setPendingBackup(null)
      notify(
        `${restored.notes} notas e ${restored.activities} atividades restauradas`,
      )
      const stats = await imagesStats()
      setImages(stats)
    } catch (error) {
      console.error(error)
      notify('Não foi possível restaurar o backup')
    } finally {
      setBackupBusy(null)
    }
  }

  async function handleInstall(): Promise<void> {
    const outcome = await installPrompt.install()
    if (outcome === 'accepted') {
      notify('Caderno instalado — abra pela tela inicial')
      return
    }
    if (outcome === 'dismissed') {
      notify('Instalação cancelada')
      return
    }
    notify('Use o menu do navegador para instalar o Caderno')
  }

  async function handleDeadlineNotifications(): Promise<void> {
    if (settings.deadlineNotifications) {
      setPushBusy(true)
      try {
        const { disableDeadlinePush } = await import('@/lib/collaboration/push')
        await disableDeadlinePush()
      } catch (error) {
        console.error('Não foi possível remover a inscrição push', error)
      } finally {
        setPushBusy(false)
      }
      settingsStore.setDeadlineNotifications(false)
      setPushCaptchaVisible(false)
      setPushError('')
      notify('Lembretes de prazo desativados')
      return
    }
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') {
      setPushError('')
      if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
        settingsStore.setDeadlineNotifications(true)
        setPushError('Push em segundo plano ainda não está configurado. Os lembretes funcionarão com o app aberto.')
        notify('Lembretes ativados para um dia antes e no dia do prazo')
        return
      }
      await activatePush()
    } else if (permission === 'denied') {
      notify('Ative as notificações do Caderno nas permissões do navegador')
    }
  }

  async function activatePush(captchaToken?: string): Promise<void> {
    setPushBusy(true)
    setPushError('')
    try {
      const { enableDeadlinePush } = await import('@/lib/collaboration/push')
      await enableDeadlinePush(captchaToken)
      setPushCaptchaVisible(false)
      settingsStore.setDeadlineNotifications(true)
      notify('Lembretes push ativados neste dispositivo')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível ativar o push.'
      if (/captcha/i.test(message)) {
        setPushCaptchaVisible(true)
        setPushCaptchaResetKey((key) => key + (captchaToken ? 1 : 0))
        setPushError(captchaToken ? 'A verificação falhou ou expirou. Faça o desafio novamente.' : 'Confirme que você é uma pessoa para ativar o push.')
      } else {
        setPushCaptchaVisible(false)
        settingsStore.setDeadlineNotifications(true)
        setPushError(`${message} Os lembretes locais continuam ativos enquanto o app estiver aberto.`)
      }
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div className="page-heading">
          <p className="eyebrow">Preferências</p>
          <h1 className="page-title">Ajustes</h1>
          <p className="page-sub">Aparência, dados e informações do app.</p>
        </div>
      </header>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2 className="settings-title">Aparência</h2>
          <p className="settings-sub">O tema vale para todas as telas e é lembrado neste aparelho.</p>
        </div>

        <div className="theme-cards" role="radiogroup" aria-label="Tema do aplicativo">
          {THEME_CARDS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={settings.theme === option.value}
              className={cn('theme-card', settings.theme === option.value && 'is-active')}
              onClick={() => settingsStore.setTheme(option.value)}
            >
              <span className="theme-card-icon">
                <Icon name={option.icon} size={20} />
              </span>
              <span className="theme-card-text">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              <span className="theme-card-check" aria-hidden="true">
                {settings.theme === option.value ? <Icon name="check" size={15} /> : null}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2 className="settings-title">Aplicativo</h2>
          <p className="settings-sub">
            Instale o Caderno na tela inicial para abrir em tela cheia e usar offline depois da
            primeira visita.
          </p>
        </div>

        {installPrompt.installed ? (
          <p className="install-status">
            <Icon name="check" size={15} />
            Instalado neste aparelho
          </p>
        ) : installPrompt.canInstall ? (
          <Button variant="primary" icon="smartphone" onClick={() => void handleInstall()}>
            Instalar app
          </Button>
        ) : (
          <div className="install-hint">
            <p>
              <strong>Android/Chrome:</strong> menu ⋮ → “Instalar app” ou “Adicionar à tela
              inicial”.
            </p>
            <p>
              <strong>iPhone/Safari:</strong> Compartilhar → “Adicionar à Tela de Início”.
            </p>
          </div>
        )}

        <p className="settings-note">
          Depois de instalado, o Caderno abre sem internet — os dados continuam salvos no
          aparelho.
        </p>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2 className="settings-title">Notificações</h2>
          <p className="settings-sub">
            Receba lembretes um dia antes e no dia do vencimento. Com push configurado, este
            dispositivo também recebe avisos quando uma nota ou atividade compartilhada é alterada,
            mesmo com o app fechado.
          </p>
        </div>
        {notificationPermission === 'unsupported' ? (
          <p className="install-hint">Este navegador não oferece notificações.</p>
        ) : notificationPermission === 'denied' && !settings.deadlineNotifications ? (
          <p className="install-hint">
            As notificações estão bloqueadas. Permita-as nas configurações do navegador para ativar
            os lembretes.
          </p>
        ) : (
          <Button
            variant={settings.deadlineNotifications ? 'secondary' : 'primary'}
            icon="bell"
            onClick={() => void handleDeadlineNotifications()}
            disabled={pushBusy}
          >
            {pushBusy ? 'Atualizando…' : settings.deadlineNotifications ? 'Desativar notificações' : 'Ativar notificações'}
          </Button>
        )}
        {pushCaptchaVisible ? (
          <Suspense fallback={<p className="install-hint">Carregando verificação…</p>}>
            <HCaptchaChallenge
              resetKey={pushCaptchaResetKey}
              onVerify={(token) => void activatePush(token)}
              onExpire={() => setPushError('O desafio hCaptcha expirou. Faça a verificação novamente.')}
              onError={setPushError}
            />
          </Suspense>
        ) : null}
        {pushError ? <p className="install-hint">{pushError}</p> : null}
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2 className="settings-title">Seus dados</h2>
          <p className="settings-sub">
            Tudo é gravado no armazenamento local do navegador. Nenhuma nota sai do aparelho sem
            você exportar.
          </p>
        </div>

        <dl className="data-list">
          <div className="data-row">
            <dt>
              <Icon name="note" size={17} />
              Notas
            </dt>
            <dd>{notes.length}</dd>
          </div>
          <div className="data-row">
            <dt>
              <Icon name="archive" size={17} />
              Arquivadas
            </dt>
            <dd>{archived}</dd>
          </div>
          <div className="data-row">
            <dt>
              <Icon name="activity" size={17} />
              Atividades
            </dt>
            <dd>{activities.length}</dd>
          </div>
          <div className="data-row">
            <dt>
              <Icon name="layers" size={17} />
              Notas no armazenamento local
            </dt>
            <dd>{formatBytes(usage)}</dd>
          </div>
          <div className="data-row">
            <dt>
              <Icon name="image" size={17} />
              Imagens de capa (IndexedDB)
            </dt>
            <dd>{images ? `${images.count} · ${formatBytes(images.bytes)}` : '—'}</dd>
          </div>
        </dl>

        <div className="settings-actions">
          <Button
            variant="secondary"
            icon="upload"
            disabled={backupBusy === 'export'}
            onClick={() => void handleExportBackup()}
          >
            {backupBusy === 'export' ? 'Preparando…' : 'Exportar backup'}
          </Button>
          <Button
            variant="secondary"
            icon="download"
            disabled={backupBusy === 'import'}
            onClick={() => backupInputRef.current?.click()}
          >
            Importar backup
          </Button>
          <Button
            variant="secondary"
            icon="download"
            disabled={backupBusy === 'import'}
            onClick={() => navigate('/importar')}
          >
            Importar nota
          </Button>
          <span className="settings-note">Backup inclui notas e imagens; “Importar nota” abre uma nota avulsa.</span>
        </div>

        <input
          ref={backupInputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void handleBackupFile(file)
          }}
        />
      </section>

      <section className="settings-card settings-card--danger">
        <div className="settings-card-head">
          <h2 className="settings-title">Zona de risco</h2>
          <p className="settings-sub">
            Apagar os dados remove todas as notas deste navegador. Não há como desfazer.
          </p>
        </div>
        <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
          Apagar todos os dados
        </Button>
      </section>

      <section className="settings-card settings-card--about">
        <div className="about-row">
          <span className="about-mark" aria-hidden="true">
            C
          </span>
          <div>
            <h2 className="about-name">{APP_NAME}</h2>
            <p className="about-meta">
              Versão {APP_VERSION} · {APP_PHASE} · feito para funcionar no navegador, inclusive
              offline.
            </p>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Apagar todos os dados?"
        description="Todas as notas, imagens, tags e preferências serão removidas deste navegador. Exporte um backup antes se quiser guardar uma cópia."
        confirmLabel="Apagar tudo"
        danger
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
      />

      <ImportBackupDialog
        open={backupDialogOpen}
        summary={
          pendingBackup
            ? {
                notes: pendingBackup.notes.length,
                images: countBackupImages(pendingBackup),
                activities: countBackupActivities(pendingBackup),
                createdAt: pendingBackup.createdAt,
                version: pendingBackup.version,
              }
            : null
        }
        busy={backupBusy === 'import'}
        onCancel={() => {
          if (backupBusy === 'import') return
          setBackupDialogOpen(false)
          setPendingBackup(null)
        }}
        onConfirm={(mode) => void handleRestoreBackup(mode)}
      />
    </div>
  )
}
