"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, InboxIcon } from "lucide-react"

import { ChartLineInteractive } from "@/components/chart-line-interactive"
import { DashboardPageSkeleton } from "@/components/skeletons/dashboard-skeleton"
import { StatusCountCards } from "@/components/status-count-cards"
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
import { api } from "@/lib/api-client"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { useCachedResource } from "@/hooks/use-cached-resource"
import type { ImportJob, Template } from "@/lib/types"

const CACHE_KEY = CLIENT_CACHE_KEYS.dashboard

type DashboardCache = {
  imports: ImportJob[]
  templates: Template[]
}

async function loadDashboardData(): Promise<DashboardCache> {
  const [importsResponse, templatesResponse] = await Promise.all([
    api("/imports"),
    api("/templates"),
  ])

  if (!importsResponse.ok || !templatesResponse.ok) {
    throw new Error("Unable to load dashboard.")
  }

  const [{ imports }, { templates }] = await Promise.all([
    importsResponse.json() as Promise<{ imports: ImportJob[] }>,
    templatesResponse.json() as Promise<{ templates: Template[] }>,
  ])

  return { imports, templates }
}

export function DashboardClient() {
  const { data, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadDashboardData,
  })

  if (loading && !data) return <DashboardPageSkeleton />

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  return (
    <>
      <DashboardSummary imports={data.imports} />
      <ChartLineInteractive imports={data.imports} templates={data.templates} />
      <DashboardTable imports={data.imports} templates={data.templates} />
    </>
  )
}

function DashboardSummary({ imports }: { imports: ImportJob[] }) {
  const savedImports = imports.filter((job) => job.status === "saved")
  const summary = savedImports.reduce(
    (acc, job) => ({
      good_count: acc.good_count + job.final_saved_count,
      missing_count: acc.missing_count + job.missing_count,
      skipped_count: acc.skipped_count + job.skipped_count,
      ai_changed_count: acc.ai_changed_count + job.ai_changed_count,
    }),
    { good_count: 0, missing_count: 0, skipped_count: 0, ai_changed_count: 0 },
  )
  return <StatusCountCards summary={summary} />
}

function DashboardTable({ imports, templates }: { imports: ImportJob[]; templates: Template[] }) {
  const recentImports = imports.slice(0, 10)

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>Recent imports</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Saved</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentImports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <InboxIcon className="size-8" />
                    <span>No imports yet. Upload a file to get started.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              recentImports.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.file_name}</TableCell>
                  <TableCell>{templates.find((t) => t.id === job.template_id)?.name ?? "Template"}</TableCell>
                  <TableCell>{job.status === "saved" ? job.final_saved_count : "-"}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell className="text-right">
                    {job.status === "saved" && (
                      <Button size="sm" variant="outline" render={<Link href={`/campaigns/${job.template_id}`} />}>
                        Open
                        <ArrowRightIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
