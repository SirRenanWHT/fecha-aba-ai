import * as Y from 'yjs'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

type ProviderStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
type StatusListener = (status: ProviderStatus) => void

const REMOTE = Symbol('remote-yjs-update')

function encode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decode(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/** Yjs collaboration transport using private Supabase Realtime channels. */
export class SupabaseYjsProvider {
  private readonly channel: RealtimeChannel
  private readonly listeners = new Set<StatusListener>()
  private saveTimer: number | null = null
  private pendingUpdates: Uint8Array[] = []
  private status: ProviderStatus = 'connecting'
  private destroyed = false

  constructor(
    private readonly room: string,
    private readonly doc: Y.Doc,
    private readonly notifyOnPersist = true,
  ) {
    this.channel = supabase.channel(`yjs:${room}`, {
      config: { private: true, broadcast: { self: false } },
    })
    this.channel
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (typeof payload?.update !== 'string') return
        Y.applyUpdate(this.doc, decode(payload.update), REMOTE)
      })
      .on('broadcast', { event: 'sync-request' }, ({ payload }) => {
        if (typeof payload?.stateVector !== 'string') return
        const missing = Y.encodeStateAsUpdate(this.doc, decode(payload.stateVector))
        void this.send('sync-response', { update: encode(missing) })
      })
      .on('broadcast', { event: 'sync-response' }, ({ payload }) => {
        if (typeof payload?.update !== 'string') return
        Y.applyUpdate(this.doc, decode(payload.update), REMOTE)
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'collab_yjs_updates',
          filter: `room=eq.${room}`,
        },
        ({ new: row }) => {
          if (typeof row.update_b64 !== 'string') return
          Y.applyUpdate(this.doc, decode(row.update_b64), REMOTE)
        },
      )

    this.doc.on('update', this.handleUpdate)
    this.channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') void this.loadAndSync()
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') this.setStatus('error')
      else if (state === 'CLOSED') this.setStatus('disconnected')
    })
  }

  getStatus(): ProviderStatus {
    return this.status
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: ProviderStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  private async send(event: string, payload: Record<string, string>): Promise<void> {
    if (this.destroyed) return
    await this.channel.send({ type: 'broadcast', event, payload })
  }

  private async loadAndSync(): Promise<void> {
    this.setStatus('connecting')
    const pageSize = 500
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('collab_yjs_updates')
        .select('update_b64')
        .eq('room', this.room)
        .order('id')
        .range(from, from + pageSize - 1)

      if (error) {
        this.setStatus('error')
        return
      }
      for (const row of data ?? []) {
        if (row.update_b64) Y.applyUpdate(this.doc, decode(row.update_b64), REMOTE)
      }
      if (!data || data.length < pageSize) break
    }

    await this.send('sync-request', { stateVector: encode(Y.encodeStateVector(this.doc)) })
    this.setStatus('connected')
  }

  private handleUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE || this.destroyed) return
    void this.send('update', { update: encode(update) })
    this.pendingUpdates.push(update)
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null
      void this.flushPending()
    }, 900)
  }

  private async flushPending(): Promise<void> {
    if (this.pendingUpdates.length === 0) return
    const updates = this.pendingUpdates.splice(0)
    const merged = Y.mergeUpdates(updates)
    const { error } = await supabase
      .from('collab_yjs_updates')
      .insert({ room: this.room, update_b64: encode(merged) })
    if (error) this.setStatus('error')
    else if (this.notifyOnPersist) {
      void import('./push').then(({ notifySharedUpdate }) => notifySharedUpdate(this.room, 'note'))
        .catch((pushError) => console.warn('Não foi possível enviar o aviso de atualização', pushError))
    }
  }

  destroy(): void {
    this.destroyed = true
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer)
    void this.flushPending()
    this.doc.off('update', this.handleUpdate)
    void supabase.removeChannel(this.channel)
    this.listeners.clear()
  }
}
