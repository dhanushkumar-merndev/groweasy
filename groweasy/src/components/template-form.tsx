"use client"

import { useTransition, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
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

function createColumn(index: number): TemplateColumn {
  if (index === 0) return defaultColumn
  return {
    ...defaultColumn,
    key: `new_column_${index + 1}`,
    label: `New Column ${index + 1}`,
    export_title: `NEW COLUMN ${index + 1}`,
  }
}

const formattingOptions: Array<{ value: FormattingRule; label: string }> = [
  { value: "title_case", label: "Title Case" },
  { value: "lowercase", label: "Lowercase" },
  { value: "uppercase", label: "Uppercase" },
  { value: "dash_to_blank", label: "Dash to Blank" },
  { value: "digits_only", label: "Digits Only" },
  { value: "last_10_digits", label: "Last 10 Digits" },
  { value: "date_dd_mm_yyyy", label: "Date DD/MM/YYYY" },
  { value: "remove_dashes", label: "Remove Dashes" },
]

export function TemplateForm({ template }: { template?: Template }) {
  const router = useRouter()
  const editing = Boolean(template?.id)
  const [name, setName] = useState(template?.name ?? "Grow Easy CRM")
  const [columns, setColumns] = useState<TemplateColumn[]>(template?.columns_config ?? [createColumn(0)])
  const [pending, startTransition] = useTransition()

  function updateColumn(index: number, patch: Partial<TemplateColumn>) {
    setColumns((current) =>
      current.map((column, columnIndex) => (columnIndex === index ? { ...column, ...patch } : column))
    )
  }

  function toggleRule(index: number, rule: FormattingRule, checked: boolean) {
    const current = columns[index]?.format_rules ?? []
    updateColumn(index, {
      format_rules: checked
        ? [...new Set([...current, rule])]
        : current.filter((value) => value !== rule),
    })
  }

  async function submit() {
    startTransition(async () => {
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
      }
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground hover:text-foreground"
          render={<Link href="/templates" />}
        >
          <ArrowLeftIcon className="size-4" />
          Templates
        </Button>
        <Button type="button" onClick={() => void submit()} loading={pending}>
          <SaveIcon />
          Save template
        </Button>
      </div>

      <div className="rounded-lg border bg-card/40 p-4">
        <div className="grid gap-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Template name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} className="h-9" />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Columns</h2>
            <p className="text-xs text-muted-foreground">{columns.length} fields in this template</p>
          </div>
        </div>
        {columns.map((column, index) => (
          <div key={`${column.key}-${index}`} className="grid gap-4 rounded-lg border bg-card/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline">Column {index + 1}</Badge>
                <span className="truncate text-sm font-medium">{column.label || "Untitled column"}</span>
                {column.required ? <Badge variant="secondary">Required</Badge> : null}
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setColumns((current) => current.filter((_, columnIndex) => columnIndex !== index))}
                disabled={columns.length === 1}
              >
                <Trash2Icon />
                Remove
              </Button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Column name</label>
                    <Input
                      className="h-9"
                      value={column.label}
                      placeholder="Name, Email, City..."
                      onChange={(event) => {
                        const label = event.target.value
                        const key = slugKey(label)
                        updateColumn(index, {
                          label,
                          key,
                          export_title: key || label.toLowerCase().replace(/\s+/g, "_"),
                        })
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Column key</label>
                    <Input className="h-9 font-mono text-xs" value={column.key} readOnly aria-label="Column key" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Source hints</label>
                  <Textarea
                    className="min-h-16 resize-y"
                    value={column.source_hints.join(", ")}
                    placeholder="name, full name, customer name"
                    onChange={(event) =>
                      updateColumn(index, {
                        source_hints: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 content-start">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Formatting</label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={column.required} onCheckedChange={(value) => updateColumn(index, { required: Boolean(value) })} />
                    Required
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {formattingOptions.map((option) => (
                    <label key={option.value} className="flex h-9 items-center gap-2 rounded-md border bg-background/40 px-3 text-sm">
                      <Checkbox
                        checked={column.format_rules.includes(option.value)}
                        onCheckedChange={(value) => toggleRule(index, option.value, Boolean(value))}
                      />
                      <span className="truncate">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => setColumns((current) => [...current, createColumn(current.length)])}>
          <PlusIcon />
          Add column
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
