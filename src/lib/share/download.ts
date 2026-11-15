export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function slugifyFilename(title: string, maxLength = 60): string {
  const slug = title
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
  return slug || 'nota'
}

export function noteFilename(title: string): string {
  return `${slugifyFilename(title)}.caderno.json`
}

export function backupFilename(date = new Date()): string {
  return `caderno-backup-${date.toISOString().slice(0, 10)}.json`
}

export function activitiesFilename(date = new Date()): string {
  return `caderno-atividades-${date.toISOString().slice(0, 10)}.json`
}
