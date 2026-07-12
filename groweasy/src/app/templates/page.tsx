import { AppShell } from "@/components/app-shell"
import { TemplatesClient } from "./templates-client"

export default async function TemplatesPage() {
  return (
    <AppShell
      title="Templates"
      description="The default GrowEasy CRM lead schema used for every upload."
    >
      <TemplatesClient />
    </AppShell>
  )
}
