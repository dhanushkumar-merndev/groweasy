"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { ensureLocalImport } from "@/lib/local-import-store"
import { readLocalValidationPreview } from "@/lib/local-validation-preview"
import type { ImportStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export function StartAiButton({
  importId,
  importStatus,
  className,
  size = "default",
}: {
  importId: string
  importStatus?: ImportStatus
  className?: string
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function startAiStep() {
    if (pending) return

    setPending(true)

    try {
      if (importStatus === "processed" || importStatus === "saved") {
        router.push(`/upload/${importId}/review`)
        return
      }

      const existing = await api(`/imports/${importId}`)

      if (existing.ok) {
        const data = await existing.json() as { import?: { status: ImportStatus } }
        if (data.import?.status === "processed" || data.import?.status === "saved") {
          router.push(`/upload/${importId}/review`)
          return
        }
        router.push(`/upload/${importId}/process`)
        return
      }

      const localData = await ensureLocalImport(importId)
      if (!localData) {
        throw new Error("Import data not found. Please upload the file again.")
      }

      const localPreview = readLocalValidationPreview(importId)

      const response = await api("/imports/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: importId,
          template_id: localData.templateId,
          file_name: localData.fileName,
          rows: localPreview ? localPreview.rows : localData.rows,
          sheets: localData.sheets,
          blank_rows_removed: localPreview?.blankRowsRemoved ?? 0,
          remove_blank_rows: localPreview?.removeBlankRows ?? true,
          dash_values_blank: localPreview?.dashValuesBlank ?? true,
          require_both_email_phone: localPreview?.requireBothEmailPhone ?? false,
          generate_description: localPreview?.generateDescription ?? false,
          correct_spelling: localPreview?.correctSpelling ?? false,
        }),
      })

      if (!response.ok) {
        const data = await response.json() as { error?: { message?: string } }
        throw new Error(data.error?.message ?? "Could not start AI processing.")
      }

      router.push(`/upload/${importId}/process`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start AI step.")
      setPending(false)
    }
  }

  return (
    <Button className={cn("flex-1", className)} size={size} onClick={startAiStep} disabled={pending}>
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : importStatus === "processed" || importStatus === "saved" ? (
        "Open review"
      ) : (
        "Start AI step"
      )}
    </Button>
  )
}
