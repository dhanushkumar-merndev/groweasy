import { AppShell } from "@/components/app-shell"
import { HistoryClient } from "./history-client"

export default async function HistoryPage() {
  return (
    <AppShell title="History" description="Permanent count-based events for uploads, saves, row changes, and exports.">
      <HistoryClient />
    </AppShell>
  )
}
