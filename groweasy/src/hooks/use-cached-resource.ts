"use client"

import * as React from "react"

import { getClientCacheSnapshot, parseClientCache, subscribeClientCache, writeClientCache } from "@/lib/client-cache"

export function useCachedResource<T>({
  cacheKey,
  load,
}: {
  cacheKey: string
  load: () => Promise<T>
}) {
  const rawSnapshot = React.useSyncExternalStore(
    React.useCallback((callback) => subscribeClientCache(cacheKey, callback), [cacheKey]),
    () => getClientCacheSnapshot(cacheKey),
    () => null,
  )
  const cachedData = React.useMemo(
    () => parseClientCache<T>(rawSnapshot, { allowExpired: true }),
    [rawSnapshot],
  )
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const resolvedData = data ?? cachedData

  React.useEffect(() => {
    let cancelled = false

    async function run() {
      const currentCachedData = parseClientCache<T>(getClientCacheSnapshot(cacheKey), { allowExpired: true })
      setRefreshing(Boolean(currentCachedData))

      try {
        const nextData = await load()
        if (cancelled) return

        writeClientCache(cacheKey, nextData)
        setData(nextData)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load data.")
        }
      } finally {
        if (!cancelled) {
          setRefreshing(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [cacheKey, load])

  return {
    data: resolvedData,
    error,
    loading: !resolvedData && !error,
    refreshing,
    setData,
  }
}
