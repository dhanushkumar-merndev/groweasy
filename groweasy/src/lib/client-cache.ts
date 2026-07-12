const TEN_MINUTES_MS = 10 * 60 * 1000

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

export function getClientCacheSnapshot(key: string): string | null {
  if (typeof window === "undefined") return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function parseClientCache<T>(raw: string | null): T | null {
  if (!raw) return null

  try {
    const record = JSON.parse(raw) as CacheRecord<T>
    if (!record.expiresAt || record.expiresAt <= Date.now()) {
      return null
    }

    return record.value
  } catch {
    return null
  }
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
  } catch {
    // Storage can be unavailable or full. The page should still work without caching.
  }
}

export function clearClientCache(...keys: string[]) {
  if (typeof window === "undefined") return

  for (const key of keys) {
    try {
      window.localStorage.removeItem(key)
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
