import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt))
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const update = () => {
      setCanInstall(Boolean(deferredPrompt))
      setInstalled(isStandalone())
    }
    listeners.add(update)
    update()

    const media = window.matchMedia('(display-mode: standalone)')
    media.addEventListener('change', update)
    return () => {
      listeners.delete(update)
      media.removeEventListener('change', update)
    }
  }, [])

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt) return 'unavailable'
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    deferredPrompt = null
    emit()
    return choice.outcome
  }

  return { canInstall: canInstall && !installed, installed, install }
}
