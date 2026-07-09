"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon } from "lucide-react"

import { ensureLocalImport, readLocalImport } from "@/lib/local-import-store"
import { UploadDropzone } from "@/components/upload-dropzone"
import type { Template } from "@/lib/types"
import type { UploadDraftFile } from "@/lib/upload-draft"

export function LocalUploadDetail({ importId, templates }: { importId: string; templates: Template[] }) {
  const router = useRouter()
  const [localData, setLocalData] = useState(() => readLocalImport(importId))

  useEffect(() => {
    if (localData) return
    ensureLocalImport(importId).then((data) => {
      if (data) setLocalData(data)
      else router.replace("/upload")
    })
  }, [importId, localData, router])

  const initialFiles = useMemo(() => {
    if (!localData) {
      return []
    }

    return localData.files?.length ? localData.files : rebuildDraftFiles(localData)
  }, [localData])

  if (!localData) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <UploadDropzone
      importId={importId}
      templates={templates}
      initialFiles={initialFiles}
      initialTemplateId={localData.templateId}
    />
  )
}

function rebuildDraftFiles(localData: NonNullable<ReturnType<typeof readLocalImport>>): UploadDraftFile[] {
  const fileName = localData.fileName || "Uploaded file"
  const prefix = `${fileName} / `

  return [
    {
      name: fileName,
      size: 0,
      parsed: {
        sheets: localData.sheets.map((sheet) => ({
          name: sheet.name.startsWith(prefix) ? sheet.name.slice(prefix.length) : sheet.name,
          rows: sheet.rows,
        })),
        rows: localData.rows.map((row) => ({
          ...row,
          source_sheet: row.source_sheet.startsWith(prefix)
            ? row.source_sheet.slice(prefix.length)
            : row.source_sheet,
        })),
      },
    },
  ]
}
