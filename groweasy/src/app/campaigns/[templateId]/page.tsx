import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, InboxIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { VirtualTable } from "@/components/virtual-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { serverFetch } from "@/lib/server-api"
import type { ImportJob, SavedRow, Template } from "@/lib/types"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const [{ template }, { imports }] = await Promise.all([
    serverFetch<{ template: Template | null }>(`/templates/${templateId}`),
    serverFetch<{ imports: ImportJob[] }>("/imports"),
  ])

  if (!template) {
    notFound()
  }

  return (
    <AppShell title={template.name} description="Editable saved rows table.">
      <CampaignDetailContent template={template} imports={imports} />
    </AppShell>
  )
}

async function CampaignDetailContent({
  template,
  imports,
}: {
  template: Template
  imports: ImportJob[]
}) {
  const templateImports = imports.filter((job) => job.template_id === template.id)
  const rowGroups = await Promise.all(
    templateImports.map(async (job) => {
      try {
        const data = await serverFetch<{ rows: SavedRow[]; total: number }>(
          `/tables/${job.id}/rows?offset=0&limit=1000`,
        )
        return data.rows
      } catch {
        return []
      }
    }),
  )
  const rows = rowGroups.flat()

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground hover:text-foreground"
          render={<Link href="/campaigns" />}
        >
          <ArrowLeftIcon className="size-4" />
          Campaigns
        </Button>
      </div>

      {rows.length === 0 || templateImports.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <InboxIcon className="size-10" />
            <div>
              <p className="font-medium text-foreground">No saved rows for this template</p>
              <p className="text-sm">Save cleaned rows from an import that uses {template.name} to see them here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <VirtualTable importId={templateImports[0].id} rows={rows} template={template} />
      )}
    </>
  )
}
