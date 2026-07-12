import { AppShell } from "@/components/app-shell"
import { CampaignsClient } from "./campaigns-client"

export default async function CampaignsPage() {
  return (
    <AppShell title="Campaigns" description="Select a template to view and edit its saved rows.">
      <CampaignsClient />
    </AppShell>
  )
}
