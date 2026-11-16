import { nanoid } from 'nanoid'
import type { Note } from '@/lib/model/note'
import { noteSchema } from '@/lib/model/note'
import { migrateNotesIfNeeded } from './migrate'
import { createSeedNotes } from './seed'
import { hasKey, readCollection, STORAGE_KEYS, writeCollection } from './storage'

type Listener = () => void

const listeners = new Set<Listener>()
let notes: Note[] = load()

function load(): Note[] {
  // Notas da Fase 1 (texto puro) são convertidas para HTML uma única vez.
  const migrated = migrateNotesIfNeeded()
  if (migrated) return migrated

  // Primeira abertura: cria notas de exemplo. Depois disso, a lista é do usuário
  // (mesmo que ele apague tudo, não semeamos de novo).
  if (!hasKey(STORAGE_KEYS.notes)) {
    const seeds = createSeedNotes()
    writeCollection(STORAGE_KEYS.notes, seeds)
    return seeds
  }
  return readCollection(STORAGE_KEYS.notes, noteSchema)
}

function persist(): void {
  writeCollection(STORAGE_KEYS.notes, notes)
}

function emit(): void {
  for (const listener of listeners) listener()
}

function replace(next: Note[]): void {
  notes = next
  persist()
  emit()
}

export type NoteDraft = Partial<
  Pick<
    Note,
    | 'title'
    | 'content'
    | 'tags'
    | 'fontFamily'
    | 'accentColor'
    | 'cardTheme'
    | 'coverImageId'
    | 'coverPositionX'
    | 'coverPositionY'
    | 'coverZoom'
    | 'pinned'
    | 'archived'
  >
>

export const notesStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  getSnapshot(): Note[] {
    return notes
  },

  getById(id: string): Note | undefined {
    return notes.find((note) => note.id === id)
  },

  create(input: NoteDraft = {}): Note {
    const now = new Date().toISOString()
    const note = noteSchema.parse({
      id: nanoid(12),
      title: '',
      content: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...input,
    })
    notes = [note, ...notes]
    persist()
    emit()
    return note
  },

  update(id: string, patch: Partial<Note>): Note | undefined {
    const index = notes.findIndex((note) => note.id === id)
    if (index === -1) return undefined
    const merged = noteSchema.parse({
      ...notes[index],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    })
    const next = notes.slice()
    next[index] = merged
    replace(next)
    return merged
  },

  remove(id: string): Note | undefined {
    const removed = notes.find((note) => note.id === id)
    if (!removed) return undefined
    replace(notes.filter((note) => note.id !== id))
    return removed
  },

  restore(note: Note): void {
    if (notes.some((item) => item.id === note.id)) return
    replace([note, ...notes])
  },

  togglePin(id: string): Note | undefined {
    const note = notes.find((item) => item.id === id)
    if (!note) return undefined
    return notesStore.update(id, { pinned: !note.pinned })
  },

  toggleArchive(id: string): Note | undefined {
    const note = notes.find((item) => item.id === id)
    if (!note) return undefined
    return notesStore.update(id, { archived: !note.archived })
  },

  replaceAll(next: Note[]): void {
    replace(next)
  },
}
