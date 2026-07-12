"use client"

import * as React from "react"

import { getClientCacheSnapshot, parseClientCache, writeClientCache } from "@/lib/client-cache"

function subscribe() {
  return () => {}
}

export function useCachedResource<T>({
  cacheKey,
  load,
}: {
  cacheKey: string
  load: () => Promise<T>
}) {
  const rawSnapshot = React.useSyncExternalStore(
    subscribe,
    () => getClientCacheSnapshot(cacheKey),
    () => null,
  )
  const cachedData = React.useMemo(
    () => parseClientCache<T>(rawSnapshot),
    [rawSnapshot],
  )
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const resolvedData = data ?? cachedData

  React.useEffect(() => {
    if (resolvedData) return

    let cancelled = false

    async function run() {
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
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [cacheKey, load, resolvedData])

  return {
    data: resolvedData,
    error,
    loading: !resolvedData && !error,
    setData,
  }
}
