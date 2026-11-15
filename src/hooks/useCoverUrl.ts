import { useEffect, useState } from 'react'
import { getImageBlob } from '@/lib/storage/imageStore'

// Cache de object URLs durante a sessão: evita reler o IndexedDB a cada render.
const urlCache = new Map<string, string>()

export function useCoverUrl(coverImageId?: string): string | null {
  const [url, setUrl] = useState<string | null>(
    coverImageId ? (urlCache.get(coverImageId) ?? null) : null,
  )

  useEffect(() => {
    if (!coverImageId) {
      setUrl(null)
      return
    }

    const cached = urlCache.get(coverImageId)
    if (cached) {
      setUrl(cached)
      return
    }

    let cancelled = false
    getImageBlob(coverImageId)
      .then((blob) => {
        if (cancelled || !blob) return
        const objectUrl = URL.createObjectURL(blob)
        urlCache.set(coverImageId, objectUrl)
        setUrl(objectUrl)
      })
      .catch((error) => {
        console.error('Não foi possível carregar a capa', error)
      })

    return () => {
      cancelled = true
    }
  }, [coverImageId])

  return url
}
