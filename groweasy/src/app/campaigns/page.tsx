import { AppShell } from "@/components/app-shell"
import { CampaignPage } from "./campaign-page"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { SavedRow } from "@/lib/types"

export default async function CampaignsPage() {
  await requireCurrentUser()

  const data = await serverFetch<{ rows: SavedRow[]; columns: string[] }>("/tables/all")

  return (
    <AppShell title="Campaigns" description="All saved rows combined into one unified campaign view.">
      <CampaignPage initialRows={data.rows} initialColumns={data.columns} />
    </AppShell>
  )
}
