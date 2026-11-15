import { z } from 'zod'
import { hasKey, LEGACY_KEYS, readValue, STORAGE_KEYS, writeValue } from './storage'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

const settingsSchema = z.object({
  theme: z.enum(THEME_PREFERENCES).default('system'),
  deadlineNotifications: z.boolean().default(false),
})

export type Settings = z.infer<typeof settingsSchema>

type Listener = () => void

const listeners = new Set<Listener>()

function loadSettings(): Settings {
  if (hasKey(STORAGE_KEYS.settings)) {
    return readValue(STORAGE_KEYS.settings, settingsSchema, {
      theme: 'system',
      deadlineNotifications: false,
    })
  }
  if (hasKey(LEGACY_KEYS.settings)) {
    const legacy = readValue(LEGACY_KEYS.settings, settingsSchema, {
      theme: 'system',
      deadlineNotifications: false,
    })
    writeValue(STORAGE_KEYS.settings, legacy)
    localStorage.removeItem(LEGACY_KEYS.settings)
    return legacy
  }
  return { theme: 'system', deadlineNotifications: false }
}

let settings: Settings = loadSettings()

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#15130f' : '#f6f2ea')
}

function emit(): void {
  for (const listener of listeners) listener()
}

export const settingsStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  getSnapshot(): Settings {
    return settings
  },

  setTheme(theme: ThemePreference): void {
    settings = { ...settings, theme }
    writeValue(STORAGE_KEYS.settings, settings)
    applyTheme(theme)
    emit()
  },

  setDeadlineNotifications(enabled: boolean): void {
    settings = { ...settings, deadlineNotifications: enabled }
    writeValue(STORAGE_KEYS.settings, settings)
    emit()
  },
}
