import { z } from 'zod'
import { activitySchema } from '@/lib/model/activity'
import { noteSchema } from '@/lib/model/note'

/** Versão do formato de compartilhamento/backup (independente do storage). */
export const SHARE_FORMAT_VERSION = 1

export const MAX_SHARE_LINK_LENGTH = 8000
export const MAX_PAYLOAD_LENGTH = 14 * 1024 * 1024

export const shareImageSchema = z.object({
  mime: z.string().min(1).max(100),
  data: z.string().min(1),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
})

export const noteTransferSchema = z.object({
  note: noteSchema,
  cover: shareImageSchema.optional(),
})

export const notePayloadSchema = z.object({
  v: z.literal(SHARE_FORMAT_VERSION),
  kind: z.literal('note'),
  createdAt: z.string(),
  note: noteTransferSchema,
})

export const activitiesPayloadSchema = z.object({
  v: z.literal(SHARE_FORMAT_VERSION),
  kind: z.literal('activities'),
  createdAt: z.string(),
  app: z.string(),
  version: z.string().optional(),
  activities: z.array(activitySchema).max(5000),
})

export const backupPayloadSchema = z.object({
  v: z.literal(SHARE_FORMAT_VERSION),
  kind: z.literal('backup'),
  createdAt: z.string(),
  app: z.string(),
  version: z.string().optional(),
  notes: z.array(noteTransferSchema).max(5000),
  activities: z.array(activitySchema).max(5000).optional(),
  settings: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
    })
    .optional(),
})

export const sharePayloadSchema = z.discriminatedUnion('kind', [
  notePayloadSchema,
  activitiesPayloadSchema,
  backupPayloadSchema,
])

export type ShareImage = z.infer<typeof shareImageSchema>
export type NoteTransfer = z.infer<typeof noteTransferSchema>
export type NotePayload = z.infer<typeof notePayloadSchema>
export type ActivitiesPayload = z.infer<typeof activitiesPayloadSchema>
export type BackupPayload = z.infer<typeof backupPayloadSchema>
export type SharePayload = z.infer<typeof sharePayloadSchema>
