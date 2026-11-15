const MAX_DIMENSION = 1600
const TARGET_BYTES = 380_000
const MIN_QUALITY = 0.5
const MAX_FILE_BYTES = 25 * 1024 * 1024

export type CompressedImage = {
  blob: Blob
  width: number
  height: number
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp) {
          resolve(webp)
          return
        }
        canvas.toBlob(
          (fallback) => {
            if (fallback) resolve(fallback)
            else reject(new Error('Não foi possível processar a imagem.'))
          },
          'image/jpeg',
          quality,
        )
      },
      'image/webp',
      quality,
    )
  })
}

/**
 * Redimensiona para no máximo 1600 px e comprime em WebP até ~380 KB.
 * Imagens grandes continuam nítidas em cards e ocupam pouco espaço no IndexedDB.
 */
export async function compressImageFile(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem (JPG, PNG, WebP…).')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Imagem muito grande: o limite é 25 MB.')
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)

    let quality = 0.84
    let blob = await canvasToBlob(canvas, quality)
    while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality -= 0.08
      blob = await canvasToBlob(canvas, quality)
    }

    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}
