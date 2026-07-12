"use client"

import * as React from "react"
import Link from "next/link"
import { InboxIcon, Table2Icon } from "lucide-react"

import { CampaignsTableSkeleton } from "@/components/skeletons/page-skeletons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { loadCampaignsData, type CampaignsData } from "@/lib/page-data"
import { useCachedResource } from "@/hooks/use-cached-resource"

const CACHE_KEY = CLIENT_CACHE_KEYS.campaignsList

function summarizeTemplates({ imports, templates }: CampaignsData) {
  const uniqueTemplates = [...new Map(templates.map((template) => [template.id, template])).values()]

  return uniqueTemplates.map((template) => {
    const templateImports = imports.filter((job) => job.template_id === template.id)
    const savedTemplateImports = templateImports.filter((job) => job.status === "saved")
    const savedRows = savedTemplateImports.reduce((total, job) => total + job.final_saved_count, 0)
    const lastUpdated = savedTemplateImports
      .map((job) => job.updated_at)
      .sort()
      .at(-1)

    return {
      template,
      imports: templateImports.length,
      savedRows,
      fields: template.columns_config.length,
      lastUpdated,
    }
  })
}

export function CampaignsClient() {
  const { data, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadCampaignsData,
  })

  if (loading && !data) return <CampaignsTableSkeleton />

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    )
  }

  const templateSummaries = data ? summarizeTemplates(data) : []

  return templateSummaries.length === 0 ? (
    <Card>
      <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <InboxIcon className="size-10" />
        <div>
          <p className="font-medium text-foreground">No templates available</p>
          <p className="text-sm">Create or restore a template before viewing campaigns.</p>
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>Campaign tables</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Imports</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templateSummaries.map((summary) => (
              <TableRow key={summary.template.id}>
                <TableCell className="font-medium">{summary.template.name}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{summary.savedRows}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{summary.imports}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{summary.fields}</TableCell>
                <TableCell className="text-muted-foreground">
                  {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleDateString() : "No saved rows yet"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" render={<Link href={`/campaigns/${summary.template.id}`} />}>
                    View table
                    <Table2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
