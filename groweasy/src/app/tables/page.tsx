import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob } from "@/lib/types"

export default async function TablesPage() {
  await requireCurrentUser()

  const { imports } = await serverFetch<{ imports: ImportJob[] }>("/imports")

  return (
    <AppShell title="Saved Tables" description="Open saved imports, filter sheets, edit rows, and export clean data.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {imports.map((job) => (
          <Card key={job.id}>
            <CardHeader>
              <CardTitle>{job.import_name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">{job.file_name}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>{job.final_saved_count || job.good_count} saved</Badge>
                <Badge variant="secondary">{job.missing_count} missing</Badge>
                <Badge variant="outline">{job.skipped_count} skipped</Badge>
              </div>
              <Button size="sm" render={<Link href={`/tables/${job.id}`} />}>
                Open table
                <ArrowRightIcon />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
