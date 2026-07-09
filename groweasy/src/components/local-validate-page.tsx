"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { ValidateClient } from "@/components/validate-client"
import { Button } from "@/components/ui/button"
import { ensureLocalImport, readLocalImport } from "@/lib/local-import-store"
import { normalizeLocalValidationRows } from "@/lib/local-validation-preview"
import type { ImportSheet, RawImportRow } from "@/lib/types"

export function LocalValidatePage({ importId }: { importId: string }) {
  const router = useRouter()
  const [localData, setLocalData] = useState(() => readLocalImport(importId))

  useEffect(() => {
    if (localData) return
    ensureLocalImport(importId).then((data) => {
      if (data) setLocalData(data)
      else router.replace("/upload")
    })
  }, [importId, localData, router])

  const rows = useMemo(
    () => (localData ? normalizeLocalValidationRows(importId, localData.rows as unknown as RawImportRow[]) : []),
    [importId, localData],
  )
  const sheets: ImportSheet[] = useMemo(
    () =>
      localData
        ? localData.sheets.map((s, i) => ({
            id: `${importId}_sheet_${i + 1}`,
            import_id: importId,
            sheet_name: s.name,
            sheet_index: i,
            total_rows: s.rows,
            good_count: 0,
            missing_count: 0,
            skipped_count: 0,
            created_at: new Date().toISOString(),
          }))
        : [],
    [importId, localData],
  )

  if (!localData) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground hover:text-foreground"
        render={<Link href={`/upload/${importId}`} />}
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Button>
      <ValidateClient
        importId={importId}
        rows={rows}
        warnings={[]}
        sheets={sheets}
        basePath={`/upload/${importId}/validate`}
      />
    </div>
  )
}
