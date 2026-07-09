"use client"

import { useEffect, useState } from "react"

import { RawPreviewTable } from "@/components/raw-preview-table"
import { ensureLocalValidationPreview, normalizeLocalValidationRows } from "@/lib/local-validation-preview"
import type { RawImportRow } from "@/lib/types"

export function PreviewClient({
  importId,
  rows,
}: {
  importId: string
  rows: RawImportRow[]
}) {
  const [displayRows, setDisplayRows] = useState(() => normalizeLocalValidationRows(importId, rows))

  useEffect(() => {
    ensureLocalValidationPreview(importId).then((localPreview) => {
      if (localPreview && localPreview.rows.length > 0) {
        setDisplayRows(normalizeLocalValidationRows(importId, localPreview.rows))
      }
    })
  }, [importId])

  return <RawPreviewTable rows={displayRows} />
}
