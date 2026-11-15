import { deleteImage } from './imageStore'
import { notesStore } from './notesStore'

/**
 * Remove uma capa do IndexedDB depois de um tempo, mas só se nenhuma nota
 * ainda a referencia. O atraso cobre o "Desfazer" da exclusão de notas.
 */
export function cleanupCoverLater(imageId: string | undefined, delayMs = 2000): void {
  if (!imageId) return
  window.setTimeout(() => {
    const stillUsed = notesStore.getSnapshot().some((note) => note.coverImageId === imageId)
    if (stillUsed) return
    void deleteImage(imageId).catch((error) => {
      console.error('Não foi possível remover a imagem de capa', error)
    })
  }, delayMs)
}
