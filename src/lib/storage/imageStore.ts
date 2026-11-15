import { nanoid } from 'nanoid'
import { compressImageFile } from '@/lib/image/compress'

export type StoredImage = {
  id: string
  blob: Blob
  width: number
  height: number
  bytes: number
  createdAt: string
}

const DB_NAME = 'ndb-images'
const STORE_NAME = 'images'
const DB_VERSION = 1

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponível'))
    })
  }
  return databasePromise
}

export async function putImage(image: StoredImage): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(image)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function getImage(id: string): Promise<StoredImage | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => {
      resolve((request.result as StoredImage | undefined) ?? null)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const record = await getImage(id)
  return record?.blob ?? null
}

export async function deleteImage(id: string): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function clearImages(): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function imagesStats(): Promise<{ count: number; bytes: number }> {  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const records = request.result as StoredImage[]
      resolve({
        count: records.length,
        bytes: records.reduce((total, record) => total + (record.bytes || record.blob.size), 0),
      })
    }
    request.onerror = () => reject(request.error)
  })
}

/** Comprime e grava uma capa; devolve o registro salvo no IndexedDB. */
export async function createCoverImage(file: File): Promise<StoredImage> {
  const compressed = await compressImageFile(file)
  const image: StoredImage = {
    id: nanoid(12),
    blob: compressed.blob,
    width: compressed.width,
    height: compressed.height,
    bytes: compressed.blob.size,
    createdAt: new Date().toISOString(),
  }
  await putImage(image)
  return image
}
