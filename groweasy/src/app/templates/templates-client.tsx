"use client"

import * as React from "react"
import Link from "next/link"
import { LockIcon, PlusIcon } from "lucide-react"

import { TemplateCardsSkeleton } from "@/components/skeletons/page-skeletons"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { loadTemplates } from "@/lib/page-data"
import { useCachedResource } from "@/hooks/use-cached-resource"
import type { Template } from "@/lib/types"

const CACHE_KEY = CLIENT_CACHE_KEYS.templatesList

export function TemplatesClient() {
  const { data: templates, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadTemplates,
  })

  if (loading && !templates) return <TemplateCardsSkeleton includeCreate />

  if (error && !templates) {
    return (
      <Card>
        <CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    )
  }

  return <TemplateGrid templates={templates ?? []} />
}

function TemplateGrid({ templates }: { templates: Template[] }) {
  const isSystem = (template: Template) => template.user_id === "system"
  const uniqueTemplates = [...new Map(templates.map((template) => [template.id, template])).values()]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {uniqueTemplates.map((template) => {
        const inner = (
          <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>{template.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {template.columns_config.length} formatted fields
                </p>
              </div>
              <Badge variant="outline">
                {isSystem(template) ? (
                  <>
                    <LockIcon className="size-3" />
                    Locked
                  </>
                ) : (
                  "Custom"
                )}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {template.columns_config.slice(0, 8).map((column) => (
                <Badge key={column.key} variant={column.required ? "default" : "secondary"}>
                  {column.label}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isSystem(template)
                ? "Default CRM schema used for upload cleaning."
                : "Custom schema for upload cleaning."}
            </p>
          </div>
        )

        if (isSystem(template)) {
          return (
            <Card key={template.id} className="py-0">
              {inner}
            </Card>
          )
        }

        return (
          <Card key={template.id} className="py-0 transition-colors hover:bg-muted/25">
            <Link href={`/templates/${template.id}/edit`} className="flex flex-1">
              {inner}
            </Link>
          </Card>
        )
      })}
      <Card className="border-dashed py-0">
        <Link
          href="/templates/new"
          className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center transition-colors hover:bg-muted/25"
        >
          <span className="grid size-12 place-items-center rounded-full border bg-muted/30 text-muted-foreground">
            <PlusIcon className="size-5" />
          </span>
          <div className="grid gap-1">
            <CardTitle>Create Template</CardTitle>
            <p className="max-w-64 text-sm text-muted-foreground">
              Add your own CRM columns and formatting rules.
            </p>
          </div>
        </Link>
      </Card>
    </div>
  )
}
