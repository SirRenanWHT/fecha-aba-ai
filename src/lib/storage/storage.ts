import type { z } from 'zod'

const NAMESPACE = 'ndb:v2'

export const STORAGE_KEYS = {
  notes: `${NAMESPACE}:notes`,
  activities: `${NAMESPACE}:activities`,
  settings: `${NAMESPACE}:settings`,
  meta: `${NAMESPACE}:meta`,
} as const

/** Chaves da Fase 1, lidas apenas pela migração. */
export const LEGACY_KEYS = {
  notes: 'ndb:v1:notes',
  settings: 'ndb:v1:settings',
  activities: 'ndb:v1:activities',
} as const

function safeParse<S extends z.ZodTypeAny>(raw: string | null, schema: S): z.output<S> | null {
  if (!raw) return null
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function hasKey(key: string): boolean {
  return localStorage.getItem(key) !== null
}

export function readCollection<S extends z.ZodTypeAny>(key: string, schema: S): z.output<S>[] {
  const parsed = safeParse(localStorage.getItem(key), schema.array())
  return parsed ?? []
}

export function writeCollection<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch (error) {
    console.error(`Não foi possível salvar "${key}"`, error)
  }
}

export function readValue<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  fallback: z.output<S>,
): z.output<S> {
  return safeParse(localStorage.getItem(key), schema) ?? fallback
}

export function writeValue<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Não foi possível salvar "${key}"`, error)
  }
}

export function storageUsageBytes(): number {
  let total = 0
  for (const key of Object.values(STORAGE_KEYS)) {
    total += (localStorage.getItem(key)?.length ?? 0) * 2
  }
  return total
}

export function clearAllData(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    localStorage.removeItem(key)
  }
  for (const key of Object.values(LEGACY_KEYS)) {
    localStorage.removeItem(key)
  }
}
