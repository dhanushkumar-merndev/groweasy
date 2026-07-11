"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  FileSpreadsheetIcon,
  RotateCcwIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react"

import { TemplateSelector } from "@/components/template-selector"
import { parseFileToRawRows, type ParsedRawUpload, type RawBatchRow } from "@/lib/raw-batch-parser"
import { saveLocalImport } from "@/lib/local-import-store"
import {
  clearUploadSession,
  consumeHardReloadNavigationReset,
  consumeUploadResetOnReload,
  markUploadResetOnUnload,
  readUploadDraft,
  UPLOAD_DRAFT_KEY,
  type UploadDraft,
  type UploadDraftFile,
} from "@/lib/upload-draft"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { Template } from "@/lib/types"

const DEFAULT_API_ROW_LIMIT = 10

type ApiKeyStatusResponse = {
  hasKey?: boolean
  isActive?: boolean
  useUserApiKey?: boolean
}

/* ─── Main component ───────────────────────────────────────────────── */
export function UploadDropzone({
  templates,
  importId,
  initialFiles = [],
  initialTemplateId,
}: {
  templates: Template[]
  importId?: string
  initialFiles?: UploadDraftFile[]
  initialTemplateId?: string
}) {
  const router = useRouter()
  const defaultTemplateId = templates[0]?.id ?? ""
  const [files, setFiles]           = useState<UploadDraftFile[]>(initialFiles)
  const [templateId, setTemplateId] = useState(initialTemplateId || defaultTemplateId)
  const [pending, setPending] = useState(false)
  const [hasActiveUserApiKey, setHasActiveUserApiKey] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const didRestoreDraftRef = useRef(false)

  const parsedUpload = useMemo<ParsedRawUpload | null>(() => {
    if (files.length === 0) return null
    const sheets: ParsedRawUpload["sheets"] = []
    const rows: RawBatchRow[] = []

    files.forEach((fileObj) => {
      fileObj.parsed.sheets.forEach((sheet) => {
        sheets.push({
          name: `${fileObj.name} / ${sheet.name}`,
          rows: sheet.rows,
        })
      })

      fileObj.parsed.rows.forEach((row) => {
        rows.push({
          ...row,
          source_sheet: `${fileObj.name} / ${row.source_sheet}`,
        })
      })
    })

    return { sheets, rows }
  }, [files])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templateId, templates],
  )
  const sheets    = useMemo(() => parsedUpload?.sheets ?? [], [parsedUpload])
  const totalRows = useMemo(() => sheets.reduce((s, sh) => s + sh.rows, 0), [sheets])

  useEffect(() => {
    if (importId) {
      didRestoreDraftRef.current = true
      return
    }

    const frame = window.requestAnimationFrame(() => {
      if (consumeUploadResetOnReload() || consumeHardReloadNavigationReset()) {
        clearUploadSession()
        didRestoreDraftRef.current = true
        return
      }

      const savedDraft = readUploadDraft()
      didRestoreDraftRef.current = true

      if (!savedDraft) {
        return
      }

      setFiles(savedDraft.files)
      setTemplateId(savedDraft.templateId || defaultTemplateId)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [defaultTemplateId, importId])

  useEffect(() => {
    let cancelled = false

    function loadApiKeyStatus() {
      api("/settings/apikey")
        .then((response) => response.json())
        .then((data: ApiKeyStatusResponse) => {
          if (cancelled) return
          setHasActiveUserApiKey(Boolean(data.isActive ?? (data.hasKey && data.useUserApiKey)))
        })
        .catch(() => {
          if (!cancelled) setHasActiveUserApiKey(false)
        })
    }

    loadApiKeyStatus()
    window.addEventListener("ai-settings-changed", loadApiKeyStatus)

    return () => {
      cancelled = true
      window.removeEventListener("ai-settings-changed", loadApiKeyStatus)
    }
  }, [])

  useEffect(() => {
    if (!didRestoreDraftRef.current) {
      return
    }

    if (files.length === 0) {
      window.sessionStorage.removeItem(UPLOAD_DRAFT_KEY)
      return
    }

    const draft: UploadDraft = {
      templateId,
      files,
    }

    try {
      window.sessionStorage.setItem(UPLOAD_DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // sessionStorage quota exceeded (large file). Draft auto-save skipped — flow continues.
    }
  }, [files, templateId])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (files.length === 0) return

      event.preventDefault()
      event.returnValue = ""
    }

    const handlePageHide = () => {
      if (files.length === 0) return

      markUploadResetOnUnload()
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [files.length])

  async function addFiles(newFiles: FileList | File[]) {
    const list = Array.from(newFiles)

    if (files.length + list.length > 5) {
      toast.error("Maximum 5 files can be uploaded.")
      return
    }

    for (const f of list) {
      try {
        const parsed = await parseFileToRawRows(f)
        setFiles((prev) => [...prev, { name: f.name, size: f.size, parsed }])
      } catch (error) {
        toast.error(error instanceof Error ? `${f.name}: ${error.message}` : `Unable to parse ${f.name}`)
      }
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    if (inputRef.current) inputRef.current.value = ""
  }

  function resetUpload() {
    setFiles([])
    setTemplateId(defaultTemplateId)
    window.sessionStorage.removeItem(UPLOAD_DRAFT_KEY)

    if (inputRef.current) {
      inputRef.current.value = ""
    }

    if (importId) {
      clearUploadSession(importId)
      router.replace("/upload")
    }
  }

  async function submitUpload() {
    if (files.length === 0 || !selectedTemplate || !parsedUpload) {
      toast.error("Choose a file and a template first.")
      return
    }

    const total = parsedUpload.sheets.reduce((s, sh) => s + sh.rows, 0)
    if (!hasActiveUserApiKey && total > DEFAULT_API_ROW_LIMIT) {
      toast.error(`Default API mode allows up to ${DEFAULT_API_ROW_LIMIT} data rows. Your file has ${total.toLocaleString()} data rows. Add and enable your own API key for larger uploads.`)
      return
    }

    if (total > 10000) {
      toast.error(`Too many rows (${total.toLocaleString()}). Maximum allowed is 10,000.`)
      return
    }

    setPending(true)
    try {
      const localId = crypto.randomUUID()
      const nextImportId = importId ?? localId
      const fileName = files.length === 1 ? files[0].name : `Grow Easy CRM (${files.length} files)`

      if (importId) {
        clearUploadSession(importId)
      }

      saveLocalImport(nextImportId, {
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        fileName,
        files,
        rows: parsedUpload.rows,
        sheets: parsedUpload.sheets,
        totalRows: total,
      })

      window.sessionStorage.setItem(UPLOAD_DRAFT_KEY, JSON.stringify({ templateId, files }))
      router.push(`/upload/${nextImportId}/validate`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.")
      setPending(false)
    }
  }

  return (
    <>
      <div className="grid gap-8 pb-10">
        <div className="grid gap-6">
        {/* Template selector and submit button */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-3 flex-1 max-w-md">
            <Label className="text-base">Cleaning Template</Label>
            <TemplateSelector templates={templates} value={templateId} onValueChange={setTemplateId} />
          </div>

          <div className="flex flex-shrink-0 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={resetUpload}
              disabled={pending || (files.length === 0 && templateId === defaultTemplateId)}
              size="default"
              className="px-4"
            >
              <RotateCcwIcon className="size-4" />
              Reset
            </Button>
            <Button
              onClick={submitUpload}
              loading={pending}
              disabled={files.length === 0 || !selectedTemplate || !parsedUpload}
              size="default"
              className={cn(
                "relative overflow-hidden w-full sm:w-auto px-4",
                "transition-all duration-200",
                "active:scale-95",
                "hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-px",
              )}
            >
              Validate
            </Button>
          </div>
        </div>

        {/* Drop zone */}
        <label
          className={cn(
            "group flex min-h-[44vh] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl",
            "border-2 border-dashed border-muted-foreground/20 bg-muted/5 p-6 text-center",
            "transition-all duration-300 hover:bg-muted/15 hover:border-primary/40",
            files.length > 0 && "min-h-[200px]",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const dropped = e.dataTransfer.files
            if (dropped && dropped.length > 0) void addFiles(dropped)
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.csv"
            className="sr-only"
            onChange={(e) => {
              const selected = e.target.files
              if (selected) void addFiles(selected)
            }}
          />
          <div className="rounded-full bg-primary/10 p-4 transition-transform duration-300 group-hover:scale-105">
            <UploadCloudIcon className="size-8 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium">Drop spreadsheets or click to browse</p>
            <p className="text-sm text-muted-foreground">
              Supports .xlsx and .csv — multiple files and sheets.
            </p>
          </div>
        </label>

        {/* Files info list */}
        {files.length > 0 && (
          <div className="grid gap-3">
            {files.map((fileObj, idx) => {
              const fileRows = fileObj.parsed.sheets.reduce((sum, sh) => sum + sh.rows, 0)
              return (
                <div
                  key={`${fileObj.name}-${idx}`}
                  className="rounded-xl border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-primary/10 p-2 shrink-0">
                      <FileSpreadsheetIcon className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fileObj.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(fileObj.size / 1024).toFixed(1)} KB · {fileRows} raw rows detected
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg shrink-0",
                        "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                        "transition-colors duration-150 cursor-pointer",
                      )}
                      title="Remove file"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>
                  {fileObj.parsed.sheets.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {fileObj.parsed.sheets.map((sheet) => (
                        <span
                          key={sheet.name}
                          className="rounded-md bg-secondary/50 px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                        >
                          {sheet.name}: {sheet.rows} rows
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Summary row */}
            <p className="text-xs text-muted-foreground text-right">
              {files.length} {files.length === 1 ? "file" : "files"} · {totalRows} total rows · {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}
            </p>
          </div>
        )}
      </div>
      </div>
    </>
  )
}
