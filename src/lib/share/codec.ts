import { MAX_PAYLOAD_LENGTH, sharePayloadSchema, type SharePayload } from './types'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * JSON → (deflate-raw quando disponível) → base64url, com um marcador de 1 letra.
 * `z` = comprimido, `u` = sem compressão (fallback).
 */
export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)

  if (typeof CompressionStream === 'undefined') {
    return `u${bytesToBase64Url(bytes)}`
  }

  const compressedStream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer())
  return `z${bytesToBase64Url(compressed)}`
}

export async function decodeSharePayload(encoded: string): Promise<SharePayload> {
  if (!encoded) throw new Error('O link não trouxe nenhum conteúdo.')
  if (encoded.length > MAX_PAYLOAD_LENGTH) {
    throw new Error('O conteúdo deste link é grande demais.')
  }

  const marker = encoded.charAt(0)
  const raw = base64UrlToBytes(encoded.slice(1))
  let bytes: Uint8Array

  if (marker === 'z') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não consegue abrir links comprimidos.')
    }
    const decompressedStream = new Blob([raw])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
    bytes = new Uint8Array(await new Response(decompressedStream).arrayBuffer())
  } else if (marker === 'u') {
    bytes = raw
  } else {
    throw new Error('Formato de link não reconhecido.')
  }

  const json = new TextDecoder().decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('O conteúdo do link está corrompido.')
  }

  const result = sharePayloadSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error('Este link não parece ter sido gerado pelo Caderno.')
  }
  return result.data
}

export function buildShareLink(encoded: string): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/importar?d=${encoded}`
}
