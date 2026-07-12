"use client"

import * as React from "react"

import { HistoryListSkeleton } from "@/components/skeletons/page-skeletons"
import { Card, CardContent } from "@/components/ui/card"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { loadExportHistory } from "@/lib/page-data"
import { useCachedResource } from "@/hooks/use-cached-resource"
import { HistoryTable } from "./history-table"

const CACHE_KEY = CLIENT_CACHE_KEYS.historyExport

export function HistoryClient() {
  const { data: history, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadExportHistory,
  })

  if (loading && !history) return <HistoryListSkeleton />

  if (error && !history) {
    return (
      <Card>
        <CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    )
  }

  return <HistoryTable history={history ?? []} />
}
