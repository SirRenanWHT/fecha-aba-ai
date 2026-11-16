import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'

export function VersionUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let active = true

    async function checkVersion(): Promise<void> {
      if (!navigator.onLine) return
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
          cache: 'no-store',
        })
        if (!response.ok) return
        const payload: unknown = await response.json()
        if (
          active &&
          typeof payload === 'object' &&
          payload !== null &&
          'version' in payload &&
          typeof payload.version === 'string' &&
          payload.version !== __APP_BUILD_ID__
        ) {
          setUpdateAvailable(true)
        }
      } catch {
        // Offline or temporarily unavailable: retry on the next check.
      }
    }

    function refresh(): void {
      if (document.visibilityState !== 'visible') return
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.update())
          .catch(() => undefined)
      }
      void checkVersion()
    }

    const interval = window.setInterval(refresh, 15 * 60 * 1000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const handleControllerChange = () => void checkVersion()

    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', handleVisibility)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    }
    refresh()

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', handleVisibility)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      }
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="app-update-notice" role="alert" aria-live="assertive">
      <Icon name="refresh" size={19} />
      <span>Há uma nova versão do Caderno disponível.</span>
      <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
        Atualizar agora
      </Button>
    </div>
  )
}
