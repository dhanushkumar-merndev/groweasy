"use client"

import * as React from "react"

import { HistoryListSkeleton } from "@/components/skeletons/page-skeletons"
import { Card, CardContent } from "@/components/ui/card"
import { api } from "@/lib/api-client"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { useCachedResource } from "@/hooks/use-cached-resource"
import type { HistoryLog } from "@/lib/types"
import { HistoryTable } from "./history-table"

const CACHE_KEY = CLIENT_CACHE_KEYS.historyExport

async function loadHistory() {
  const response = await api("/history?type=export")
  if (!response.ok) throw new Error("Unable to load history.")

  const { history } = (await response.json()) as { history: HistoryLog[] }
  return history
}

export function HistoryClient() {
  const { data: history, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadHistory,
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
