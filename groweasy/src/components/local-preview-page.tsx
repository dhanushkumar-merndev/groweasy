"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { PreviewClient } from "@/components/preview-client"
import { StartAiButton } from "@/components/start-ai-button"
import { Button } from "@/components/ui/button"
import { ensureLocalImport, readLocalImport } from "@/lib/local-import-store"
import { normalizeLocalValidationRows } from "@/lib/local-validation-preview"
import type { RawImportRow } from "@/lib/types"

export function LocalPreviewPage({ importId }: { importId: string }) {
  const router = useRouter()
  const [localData, setLocalData] = useState(() => readLocalImport(importId))

  useEffect(() => {
    if (localData) return
    ensureLocalImport(importId).then((data) => {
      if (data) setLocalData(data)
      else router.replace("/upload")
    })
  }, [importId, localData, router])

  const rows: RawImportRow[] = useMemo(
    () => (localData ? normalizeLocalValidationRows(importId, localData.rows as unknown as RawImportRow[]) : []),
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
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground hover:text-foreground"
          render={<Link href={`/upload/${importId}/validate`} />}
        >
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
        <StartAiButton importId={importId} size="sm" className="flex-none" />
      </div>
      <PreviewClient importId={importId} rows={rows} />
    </div>
  )
}
