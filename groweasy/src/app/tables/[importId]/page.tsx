import { AppShell } from "@/components/app-shell"
import { ExportMenu } from "@/components/export-menu"
import { SheetTabs } from "@/components/sheet-tabs"
import { VirtualTable } from "@/components/virtual-table"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, ImportSheet, SavedRow, Template } from "@/lib/types"

export default async function SavedTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>
  searchParams: Promise<{ sheet?: string }>
}) {
  const { importId } = await params
  const { sheet } = await searchParams
  await requireCurrentUser()

  const importData = await serverFetch<{ import: ImportJob; template: Template | null; sheets: ImportSheet[] }>(
    `/imports/${importId}`
  )
  const { import: job, template } = importData

  if (!job || !template) return null

  const rowsData = await serverFetch<{ rows: SavedRow[]; total: number }>(
    `/tables/${importId}/rows?offset=0&limit=10000${sheet ? `&sheet=${sheet}` : ""}`
  )

  return (
    <AppShell title={job.import_name} description="Virtualized saved rows with inline editing and autocomplete." actions={<ExportMenu importId={importId} />}>
      <div className="grid gap-4">
        <SheetTabs sheets={importData.sheets} basePath={`/tables/${importId}`} activeSheet={sheet} />
        <VirtualTable importId={importId} rows={rowsData.rows} template={template} />
      </div>
    </AppShell>
  )
}
