import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p',
  'div',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
]

const ALLOWED_ATTR = ['href']

/**
 * Conteúdo de nota é sempre passado por aqui antes de ir para o storage e
 * antes de voltar para a tela. A lista de tags é intencionalmente curta.
 */
export function sanitizeNoteHtml(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

export function isEmptyHtml(html: string): boolean {
  if (!html) return true
  const container = document.createElement('div')
  container.innerHTML = html
  return (container.textContent ?? '').trim().length === 0
}

/** Sanitiza e transforma conteúdo "vazio" (só <br>/<div>) em string vazia. */
export function normalizeNoteHtml(html: string): string {
  const clean = sanitizeNoteHtml(html)
  return isEmptyHtml(clean) ? '' : clean
}

export function htmlToText(html: string): string {
  if (!html) return ''
  // Garante espaço entre blocos: textContent sozinho colaria "fim." + "Começo".
  const spaced = html
    .replace(/<\/(p|div|h2|h3|li|blockquote)>/gi, '</$1> ')
    .replace(/<br\s*\/?>/gi, ' ')
  const doc = new DOMParser().parseFromString(spaced, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Migração F1: texto puro com quebras de linha vira parágrafos HTML. */
export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
