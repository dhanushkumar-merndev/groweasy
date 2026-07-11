import Link from "next/link"
import { InboxIcon, Table2Icon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, Template } from "@/lib/types"

export default async function CampaignsPage() {
  await requireCurrentUser()

  const [{ imports }, { templates }] = await Promise.all([
    serverFetch<{ imports: ImportJob[] }>("/imports"),
    serverFetch<{ templates: Template[] }>("/templates"),
  ])

  const templateSummaries = templates.map((template) => {
    const templateImports = imports.filter((job) => job.template_id === template.id)
    const savedTemplateImports = templateImports.filter((job) => job.status === "saved")
    const savedRows = savedTemplateImports.reduce((total, job) => total + job.final_saved_count, 0)
    const lastUpdated = savedTemplateImports
      .map((job) => job.updated_at)
      .sort()
      .at(-1)

    return {
      template,
      imports: templateImports.length,
      savedRows,
      fields: template.columns_config.length,
      lastUpdated,
    }
  })

  return (
    <AppShell title="Campaigns" description="Select a template to view and edit its saved rows.">
      {templateSummaries.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <InboxIcon className="size-10" />
            <div>
              <p className="font-medium text-foreground">No templates available</p>
              <p className="text-sm">Create or restore a template before viewing campaigns.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader>
            <CardTitle>Campaign tables</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Imports</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templateSummaries.map((summary) => (
                  <TableRow key={summary.template.id}>
                    <TableCell className="font-medium">{summary.template.name}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{summary.savedRows}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{summary.imports}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{summary.fields}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleDateString() : "No saved rows yet"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" render={<Link href={`/campaigns/${summary.template.id}`} />}>
                        View table
                        <Table2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}
