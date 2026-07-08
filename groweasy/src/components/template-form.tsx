"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { FormattingRule, Template, TemplateColumn } from "@/lib/types"

const defaultColumn: TemplateColumn = {
  key: "new_column",
  label: "New Column",
  source_hints: [],
  required: false,
  format_rules: ["title_case", "dash_to_blank"],
  export_title: "NEW COLUMN",
}

export function TemplateForm({ template }: { template?: Template }) {
  const router = useRouter()
  const editing = Boolean(template?.id)
  const [name, setName] = useState(template?.name ?? "Lead Cleaning Template")
  const [columns, setColumns] = useState<TemplateColumn[]>(template?.columns_config ?? [defaultColumn])
  const [pending, setPending] = useState(false)

  function updateColumn(index: number, patch: Partial<TemplateColumn>) {
    setColumns((current) =>
      current.map((column, columnIndex) => (columnIndex === index ? { ...column, ...patch } : column))
    )
  }

  async function submit() {
    setPending(true)

    try {
      const response = await api(editing ? `/templates/${template?.id}` : "/templates", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          columns_config: columns,
          formatting_rules: {},
        }),
      })
      const data = (await response.json()) as { error?: { message?: string } }

      if (!response.ok) {
        throw new Error(data.error?.message ?? "Unable to save template.")
      }

      toast.success("Template saved.")
      router.push("/templates")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save template.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <label className="text-sm font-medium">Template name</label>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-3">
        {columns.map((column, index) => (
          <div key={`${column.key}-${index}`} className="grid gap-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={column.label}
                placeholder="Column label"
                onChange={(event) => {
                  const label = event.target.value
                  const key = slugKey(label)
                  updateColumn(index, {
                    label,
                    key,
                    export_title: label.toUpperCase(),
                  })
                }}
              />
              <Input value={column.key} readOnly aria-label="Column key" />
            </div>
            <Textarea
              value={column.source_hints.join(", ")}
              placeholder="Source hints: name, full name, customer"
              onChange={(event) =>
                updateColumn(index, {
                  source_hints: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
            <Textarea
              value={column.format_rules.join(", ")}
              placeholder="Rules: title_case, dash_to_blank, digits_only"
              onChange={(event) =>
                updateColumn(index, {
                  format_rules: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean) as FormattingRule[],
                })
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={column.required} onCheckedChange={(value) => updateColumn(index, { required: Boolean(value) })} />
                Required field
              </label>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setColumns((current) => current.filter((_, columnIndex) => columnIndex !== index))}
              >
                <Trash2Icon />
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setColumns((current) => [...current, defaultColumn])}>
          <PlusIcon />
          Add column
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={pending}>
          <SaveIcon />
          {pending ? "Saving..." : "Save template"}
        </Button>
      </div>
    </div>
  )
}

function slugKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
