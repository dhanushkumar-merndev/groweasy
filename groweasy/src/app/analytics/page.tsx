import { ChartBuilder } from "@/components/chart-builder"
import { AppShell } from "@/components/app-shell"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, SavedRow } from "@/lib/types"

export default async function AnalyticsPage() {
  await requireCurrentUser()

  const { imports } = await serverFetch<{ imports: ImportJob[] }>("/imports")
  const importJob = imports[0]
  let rows: SavedRow[] = []

  if (importJob) {
    try {
      const data = await serverFetch<{ rows: SavedRow[]; total: number }>(
        `/tables/${importJob.id}/rows?offset=0&limit=1000`
      )
      rows = data.rows
    } catch {
      rows = []
    }
  }

  return (
    <AppShell title="Analytics" description="Build charts from saved table data and export local screenshots.">
      <ChartBuilder rows={rows} />
    </AppShell>
  )
}
