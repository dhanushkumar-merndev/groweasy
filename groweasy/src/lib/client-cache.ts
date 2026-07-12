const TEN_MINUTES_MS = 10 * 60 * 1000
const CACHE_EVENT = "groweasy:client-cache"

export const CLIENT_CACHE_KEYS = {
  analyticsList: "groweasy:analytics:list:v1",
  campaignsList: "groweasy:campaigns:list:v1",
  dashboard: "groweasy:dashboard:v1",
  historyExport: "groweasy:history:export:v1",
  templatesList: "groweasy:templates:list:v1",
} as const

type CacheRecord<T> = {
  expiresAt: number
  value: T
}

const prefetchPromises = new Map<string, Promise<unknown>>()

export function subscribeClientCache(key: string, callback: () => void) {
  if (typeof window === "undefined") return () => {}

  function onCacheEvent(event: Event) {
    const detail = (event as CustomEvent<{ key?: string }>).detail
    if (!detail?.key || detail.key === key) callback()
  }

  function onStorage(event: StorageEvent) {
    if (event.key === key) callback()
  }

  window.addEventListener(CACHE_EVENT, onCacheEvent)
  window.addEventListener("storage", onStorage)

  return () => {
    window.removeEventListener(CACHE_EVENT, onCacheEvent)
    window.removeEventListener("storage", onStorage)
  }
}

export function getClientCacheSnapshot(key: string): string | null {
  if (typeof window === "undefined") return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function parseClientCache<T>(raw: string | null, options: { allowExpired?: boolean } = {}): T | null {
  if (!raw) return null

  try {
    const record = JSON.parse(raw) as CacheRecord<T>
    if (!record.expiresAt || (!options.allowExpired && record.expiresAt <= Date.now())) {
      return null
    }

    return record.value
  } catch {
    return null
  }
}

export function hasFreshClientCache(key: string) {
  return parseClientCache(getClientCacheSnapshot(key)) !== null
}

export function readClientCache<T>(key: string): T | null {
  const raw = getClientCacheSnapshot(key)
  const value = parseClientCache<T>(raw)

  if (raw && !value && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage failures; a fresh fetch can still repopulate the cache.
    }
  }

  return value
}

export function writeClientCache<T>(key: string, value: T, ttlMs = TEN_MINUTES_MS) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        expiresAt: Date.now() + ttlMs,
        value,
      } satisfies CacheRecord<T>),
    )
    window.dispatchEvent(new CustomEvent(CACHE_EVENT, { detail: { key } }))
  } catch {
    // Storage can be unavailable or full. The page should still work without caching.
  }
}

export function prefetchCachedResource<T>({
  cacheKey,
  load,
  force = false,
}: {
  cacheKey: string
  load: () => Promise<T>
  force?: boolean
}) {
  if (typeof window === "undefined") return Promise.resolve(null)
  if (!force && hasFreshClientCache(cacheKey)) return Promise.resolve(readClientCache<T>(cacheKey))

  const existing = prefetchPromises.get(cacheKey) as Promise<T> | undefined
  if (existing) return existing

  const promise = load()
    .then((data) => {
      writeClientCache(cacheKey, data)
      return data
    })
    .finally(() => {
      prefetchPromises.delete(cacheKey)
    })

  prefetchPromises.set(cacheKey, promise)
  return promise
}

export function clearClientCache(...keys: string[]) {
  if (typeof window === "undefined") return

  for (const key of keys) {
    try {
      window.localStorage.removeItem(key)
      window.dispatchEvent(new CustomEvent(CACHE_EVENT, { detail: { key } }))
    } catch {
      // Ignore storage failures; fresh fetches will still work.
    }
  }
}

export function clearGrowEasyDataCache() {
  clearClientCache(
    CLIENT_CACHE_KEYS.analyticsList,
    CLIENT_CACHE_KEYS.campaignsList,
    CLIENT_CACHE_KEYS.dashboard,
    CLIENT_CACHE_KEYS.historyExport,
  )
}

export function clearGrowEasyTemplateCache() {
  clearClientCache(CLIENT_CACHE_KEYS.templatesList)
  clearGrowEasyDataCache()
}
