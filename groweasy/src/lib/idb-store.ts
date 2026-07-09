const DB_NAME = "groweasy-store"
const DB_VERSION = 1
const STORE_NAME = "local-imports"
const DEFAULT_TTL_MS = 86_400_000 // 1 day

type Envelope<T> = { data: T; expiresAt: number }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => {
        const envelope = req.result as Envelope<T> | undefined
        if (!envelope) return resolve(null)
        if (Date.now() > envelope.expiresAt) {
          tx.oncomplete = () => {
            db.close()
            idbDelete(key)
            resolve(null)
          }
          return
        }
        resolve(envelope.data)
      }
      req.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

export async function purgeExpired(): Promise<number> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const req = tx.objectStore(STORE_NAME).openCursor()
      let count = 0
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve(count)
          return
        }
        const envelope = cursor.value as Envelope<unknown>
        if (Date.now() > envelope.expiresAt) {
          cursor.delete()
          count++
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return 0
  }
}

export async function idbSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): Promise<boolean> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const envelope: Envelope<T> = { data: value, expiresAt: Date.now() + ttlMs }
      tx.objectStore(STORE_NAME).put(envelope, key)
      tx.oncomplete = () => {
        db.close()
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return false
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => db.close()
  } catch {
    // ignore
  }
}
