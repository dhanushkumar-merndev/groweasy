import Link from "next/link"
import { UploadCloudIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { DashboardClient } from "./dashboard-client"

export default async function DashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      description="Monitor imports, saved rows, templates, and AI cleaning history."
      actions={
        <Button render={<Link href="/upload" />}>
          <UploadCloudIcon />
          Upload
        </Button>
      }
    >
      <DashboardClient />
    </AppShell>
  )
}
