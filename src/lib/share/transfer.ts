import { nanoid } from 'nanoid'
import { APP_NAME, APP_VERSION } from '@/config'
import type { Activity } from '@/lib/model/activity'
import type { Note } from '@/lib/model/note'
import { activitiesStore } from '@/lib/storage/activitiesStore'
import { clearImages, getImage, putImage } from '@/lib/storage/imageStore'
import { notesStore } from '@/lib/storage/notesStore'
import { settingsStore } from '@/lib/storage/settingsStore'
import { sanitizeNoteHtml } from '@/lib/utils/html'
import {
  SHARE_FORMAT_VERSION,
  type ActivitiesPayload,
  type BackupPayload,
  type NotePayload,
  type NoteTransfer,
  type ShareImage,
} from './types'

export type RestoreMode = 'merge' | 'replace'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler a imagem.'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

/** Empacota a nota + capa (se existir) para link/arquivo/backup. */
export async function buildNoteTransfer(note: Note): Promise<NoteTransfer> {
  let cover: ShareImage | undefined

  if (note.coverImageId) {
    try {
      const record = await getImage(note.coverImageId)
      if (record) {
        cover = {
          mime: record.blob.type || 'image/webp',
          data: await blobToBase64(record.blob),
          width: record.width,
          height: record.height,
        }
      }
    } catch (error) {
      // A nota continua compartilhável sem a capa.
      console.error('Não foi possível incluir a imagem de capa', error)
    }
  }

  return {
    note: { ...note, content: sanitizeNoteHtml(note.content) },
    cover,
  }
}

export async function buildNotePayload(note: Note): Promise<NotePayload> {
  return {
    v: SHARE_FORMAT_VERSION,
    kind: 'note',
    createdAt: new Date().toISOString(),
    note: await buildNoteTransfer(note),
  }
}

export async function buildBackupPayload(notes: Note[]): Promise<BackupPayload> {
  const transfers: NoteTransfer[] = []
  for (const note of notes) {
    transfers.push(await buildNoteTransfer(note))
  }
  return {
    v: SHARE_FORMAT_VERSION,
    kind: 'backup',
    createdAt: new Date().toISOString(),
    app: APP_NAME,
    version: APP_VERSION,
    notes: transfers,
    activities: activitiesStore.getSnapshot(),
    settings: { theme: settingsStore.getSnapshot().theme },
  }
}

/** Cria uma cópia editável da nota importada, com id e imagem novos. */
export async function importNoteTransfer(
  transfer: NoteTransfer,
  options?: { preserveArchived?: boolean },
): Promise<Note> {
  let coverImageId: string | undefined

  if (transfer.cover) {
    const blob = base64ToBlob(transfer.cover.data, transfer.cover.mime)
    const id = nanoid(12)
    await putImage({
      id,
      blob,
      width: transfer.cover.width,
      height: transfer.cover.height,
      bytes: blob.size,
      createdAt: new Date().toISOString(),
    })
    coverImageId = id
  }

  return notesStore.create({
    title: transfer.note.title,
    content: sanitizeNoteHtml(transfer.note.content),
    tags: transfer.note.tags,
    fontFamily: transfer.note.fontFamily,
    accentColor: transfer.note.accentColor,
    cardTheme: transfer.note.cardTheme,
    coverImageId,
    coverPositionX: transfer.note.coverPositionX,
    coverPositionY: transfer.note.coverPositionY,
    coverZoom: transfer.note.coverZoom,
    pinned: transfer.note.pinned,
    archived: options?.preserveArchived ? transfer.note.archived : false,
  })
}

/** Cria uma cópia editável de uma atividade restaurada/importada. */
export function importActivityTransfer(activity: Activity): Activity {
  return activitiesStore.create({
    title: activity.title,
    description: activity.description,
    status: activity.status,
    progressMode: activity.progressMode,
    progress: activity.progress,
    subtasks: activity.subtasks.map((subtask) => ({
      ...subtask,
      id: nanoid(8),
    })),
    dueDate: activity.dueDate,
    priority: activity.priority,
    project: activity.project,
  })
}

export function buildActivitiesPayload(): ActivitiesPayload {
  return {
    v: SHARE_FORMAT_VERSION,
    kind: 'activities',
    createdAt: new Date().toISOString(),
    app: APP_NAME,
    version: APP_VERSION,
    activities: activitiesStore.getSnapshot(),
  }
}

export function importActivitiesPayload(payload: ActivitiesPayload): number {
  for (const activity of payload.activities) {
    importActivityTransfer(activity)
  }
  return payload.activities.length
}

export type RestoreResult = {
  notes: number
  activities: number
}

export async function restoreBackup(
  payload: BackupPayload,
  mode: RestoreMode,
): Promise<RestoreResult> {
  if (mode === 'replace') {
    await clearImages()
    notesStore.replaceAll([])
    // Backups antigos (antes da F4) não têm atividades: preserva as atuais.
    if (payload.activities !== undefined) activitiesStore.clear()
  }

  let notes = 0
  for (const transfer of payload.notes) {
    await importNoteTransfer(transfer, { preserveArchived: true })
    notes += 1
  }

  let activities = 0
  for (const activity of payload.activities ?? []) {
    importActivityTransfer(activity)
    activities += 1
  }

  if (payload.settings?.theme) {
    settingsStore.setTheme(payload.settings.theme)
  }

  return { notes, activities }
}

export function countBackupImages(payload: BackupPayload): number {
  return payload.notes.filter((transfer) => transfer.cover).length
}

export function countBackupActivities(payload: BackupPayload): number {
  return payload.activities?.length ?? 0
}
