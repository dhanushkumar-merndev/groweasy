"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { FileSpreadsheetIcon, Loader2Icon, UploadCloudIcon } from "lucide-react"

import { CleanBatchResultView, type CleanBatchResponse } from "@/components/clean-batch-result"
import { TemplateSelector } from "@/components/template-selector"
import { api } from "@/lib/api-client"
import { createRawBatchPayload, parseFileToRawRows, type ParsedRawUpload } from "@/lib/raw-batch-parser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { Template } from "@/lib/types"

export function UploadDropzone({ templates }: { templates: Template[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "")
  const [parsedUpload, setParsedUpload] = useState<ParsedRawUpload | null>(null)
  const [result, setResult] = useState<CleanBatchResponse | null>(null)
  const [pending, setPending] = useState(false)
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates]
  )
  const sheets = useMemo(() => parsedUpload?.sheets ?? [], [parsedUpload])
  const totalRows = useMemo(() => sheets.reduce((total, sheet) => total + sheet.rows, 0), [sheets])

  async function inspectFile(nextFile: File) {
    setFile(nextFile)
    setParsedUpload(null)
    setResult(null)

    try {
      setParsedUpload(await parseFileToRawRows(nextFile))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to parse this file.")
    }
  }

  async function submitUpload() {
    if (!file || !selectedTemplate || !parsedUpload) {
      toast.error("Choose a file and a template first.")
      return
    }

    setPending(true)
    const payload = createRawBatchPayload(selectedTemplate, parsedUpload)

    try {
      const response = await api("/clean-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as CleanBatchResponse

      if (!response.ok) {
        throw new Error(data.error?.message ?? "Batch cleaning failed.")
      }

      setResult(data)
      toast.success("Batch cleaned by Groq.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch cleaning failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload workbook</CardTitle>
        <CardDescription>Upload a CSV or Excel file and send the raw parsed rows to Groq.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <label
          className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 p-6 text-center transition hover:bg-muted/50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const dropped = event.dataTransfer.files.item(0)

            if (dropped) {
              void inspectFile(dropped)
            }
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.item(0)

              if (selected) {
                void inspectFile(selected)
              }
            }}
          />
          <UploadCloudIcon className="size-8 text-primary" />
          <div>
            <p className="font-medium">Drop a spreadsheet or choose a file</p>
            <p className="text-sm text-muted-foreground">Headers and raw cell values are preserved for backend cleaning.</p>
          </div>
        </label>

        {file ? (
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheetIcon className="size-5 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {totalRows} raw rows detected
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sheets.map((sheet) => (
                <span key={sheet.name} className="rounded-md border px-2 py-1 text-xs">
                  {sheet.name}: {sheet.rows}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label>Template</Label>
          <TemplateSelector templates={templates} value={templateId} onValueChange={setTemplateId} />
        </div>

        <Button onClick={submitUpload} disabled={pending || !file || !selectedTemplate || !parsedUpload} className="w-full sm:w-fit">
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Clean batch
        </Button>

        {result ? <CleanBatchResultView result={result} /> : null}
      </CardContent>
    </Card>
  )
}
