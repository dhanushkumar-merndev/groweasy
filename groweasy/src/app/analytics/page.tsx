import { AppShell } from "@/components/app-shell"
import { AnalyticsClient } from "./analytics-client"

export default async function AnalyticsPage() {
  return (
    <AppShell title="Analytics" description="Select a template to inspect and edit its saved rows.">
      <AnalyticsClient />
    </AppShell>
  )
}
