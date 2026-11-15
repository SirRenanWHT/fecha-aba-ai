import type { Note } from '@/lib/model/note'
import { noteSchema } from '@/lib/model/note'
import { plainTextToHtml } from '@/lib/utils/html'
import { hasKey, LEGACY_KEYS, readCollection, STORAGE_KEYS, writeCollection } from './storage'

/**
 * F1 guardava texto puro em `content`. A F2 passa a guardar HTML.
 * A migração roda uma única vez, mantendo as notas que o usuário já tinha.
 */
export function migrateNotesIfNeeded(): Note[] | null {
  if (hasKey(STORAGE_KEYS.notes)) return null
  if (!hasKey(LEGACY_KEYS.notes)) return null

  try {
    const legacy = readCollection(LEGACY_KEYS.notes, noteSchema)
    const migrated = legacy.map((note) => ({
      ...note,
      content: plainTextToHtml(note.content),
    }))
    writeCollection(STORAGE_KEYS.notes, migrated)
    if (!hasKey(STORAGE_KEYS.notes)) return null
    localStorage.removeItem(LEGACY_KEYS.notes)
    return migrated
  } catch (error) {
    console.error('Falha ao migrar as notas da Fase 1', error)
    return null
  }
}
