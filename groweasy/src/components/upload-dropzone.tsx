"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { FileSpreadsheetIcon, Loader2Icon, UploadCloudIcon } from "lucide-react"

import { TemplateSelector } from "@/components/template-selector"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { Template } from "@/lib/types"

type SheetPreview = {
  name: string
  rows: number
}

export function UploadDropzone({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "")
  const [removeBlankRows, setRemoveBlankRows] = useState(true)
  const [dashValuesBlank, setDashValuesBlank] = useState(true)
  const [sheets, setSheets] = useState<SheetPreview[]>([])
  const [pending, setPending] = useState(false)
  const totalRows = useMemo(() => sheets.reduce((total, sheet) => total + sheet.rows, 0), [sheets])

  async function inspectFile(nextFile: File) {
    setFile(nextFile)

    try {
      const workbook = XLSX.read(await nextFile.arrayBuffer(), { type: "array" })
      const preview = workbook.SheetNames.map((name) => ({
        name,
        rows: Math.max(0, XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length - 1),
      }))
      setSheets(preview)
    } catch {
      setSheets([])
      toast.error("Unable to preview this workbook. The server will validate it on upload.")
    }
  }

  async function submitUpload() {
    if (!file || !templateId) {
      toast.error("Choose a file and a template first.")
      return
    }

    setPending(true)
    const formData = new FormData()
    formData.set("file", file)
    formData.set("template_id", templateId)
    formData.set("remove_blank_rows", String(removeBlankRows))
    formData.set("dash_values_blank", String(dashValuesBlank))

    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      })
      const data = (await response.json()) as { next?: string; error?: { message: string } }

      if (!response.ok || !data.next) {
        throw new Error(data.error?.message ?? "Upload failed.")
      }

      router.push(data.next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.")
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload workbook</CardTitle>
        <CardDescription>Upload Excel, CSV, TSV, or ODS files. AI processing starts only after validation.</CardDescription>
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
            accept=".xlsx,.xls,.csv,.tsv,.ods"
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
            <p className="text-sm text-muted-foreground">Multi-sheet workbooks are preserved under one import.</p>
          </div>
        </label>

        {file ? (
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheetIcon className="size-5 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {totalRows} raw rows detected</p>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border p-3">
            <Checkbox checked={removeBlankRows} onCheckedChange={(value) => setRemoveBlankRows(Boolean(value))} />
            <span className="text-sm">Remove blank rows</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border p-3">
            <Checkbox checked={dashValuesBlank} onCheckedChange={(value) => setDashValuesBlank(Boolean(value))} />
            <span className="text-sm">Treat dash/NA values as blank</span>
          </label>
        </div>

        <Button onClick={submitUpload} disabled={pending || !file || !templateId} className="w-full sm:w-fit">
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Validate upload
        </Button>
      </CardContent>
    </Card>
  )
}
