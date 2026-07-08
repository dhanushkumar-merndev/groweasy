import { ChartBuilder } from "@/components/chart-builder"
import { AppShell } from "@/components/app-shell"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function AnalyticsPage() {
  const user = await requireCurrentUser()
  const importJob = store.listImports(user.id)[0]
  const rows = importJob ? store.listSavedRows(user.id, importJob.id) : []

  return (
    <AppShell title="Analytics" description="Build charts from saved table data and export local screenshots.">
      <ChartBuilder rows={rows} />
    </AppShell>
  )
}
