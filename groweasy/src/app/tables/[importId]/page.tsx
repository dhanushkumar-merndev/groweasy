import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { ExportMenu } from "@/components/export-menu"
import { SheetTabs } from "@/components/sheet-tabs"
import { VirtualTable } from "@/components/virtual-table"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function SavedTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>
  searchParams: Promise<{ sheet?: string }>
}) {
  const { importId } = await params
  const { sheet } = await searchParams
  const user = await requireCurrentUser()
  const job = store.getImport(user.id, importId)

  if (!job) {
    notFound()
  }

  const template = store.getTemplate(user.id, job.template_id)

  if (!template) {
    notFound()
  }

  const rows = store.listSavedRows(user.id, importId).filter((row) => (sheet ? row.sheet_name === sheet : true))

  return (
    <AppShell title={job.import_name} description="Virtualized saved rows with inline editing and autocomplete." actions={<ExportMenu importId={importId} />}>
      <div className="grid gap-4">
        <SheetTabs sheets={store.listSheets(importId)} basePath={`/tables/${importId}`} activeSheet={sheet} />
        <VirtualTable importId={importId} rows={rows} template={template} />
      </div>
    </AppShell>
  )
}
