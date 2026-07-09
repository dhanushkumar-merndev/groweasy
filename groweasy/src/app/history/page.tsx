import { AppShell } from "@/components/app-shell"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { HistoryLog } from "@/lib/types"
import { HistoryTable } from "./history-table"

export default async function HistoryPage() {
  await requireCurrentUser()

  const { history } = await serverFetch<{ history: HistoryLog[] }>("/history?type=export")

  return (
    <AppShell title="History" description="Permanent count-based events for uploads, saves, row changes, and exports.">
      <HistoryTable history={history} />
    </AppShell>
  )
}
