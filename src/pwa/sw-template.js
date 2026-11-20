/* Caderno — service worker gerado no build. */
const VERSION = '__VERSION__'
const BASE = '__BASE__'
const PRECACHE = __PRECACHE__

const CACHE_NAME = `caderno-${VERSION}`
const INDEX_URL = `${BASE}index.html`

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() ?? '' }
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Lembrete do Caderno', {
    body: payload.body || 'Uma atividade compartilhada está perto do vencimento.',
    icon: `${BASE}icons/icon-192.png`,
    tag: payload.tag || 'shared-activity-reminder',
    data: { url: payload.url || '#/atividades' },
  }))
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(
        PRECACHE.map((url) => new Request(url, { cache: 'reload' })),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('caderno-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = event.notification.data?.url
  const activityId = event.notification.data?.activityId
  if (!route && !activityId) return
  const targetUrl = route
    ? `${self.location.origin}${BASE}${route.startsWith('#') ? route : `#${route}`}`
    : `${self.location.origin}${BASE}#/atividade/${encodeURIComponent(activityId)}`
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('navigate' in client) await client.navigate(targetUrl)
        await client.focus()
        return
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const versionUrl = new URL(`${BASE}version.json`, self.location.origin)
  if (url.href === versionUrl.href) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME)
            await cache.put(INDEX_URL, response.clone())
          }
          return response
        } catch {
          const cached =
            (await caches.match(INDEX_URL)) || (await caches.match(BASE))
          if (cached) return cached
          return new Response(
            'O Caderno está offline e ainda não foi aberto neste aparelho.',
            {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            },
          )
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' })
      }
    })(),
  )
})
