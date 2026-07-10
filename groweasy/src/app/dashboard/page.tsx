import { Suspense } from "react"
import Link from "next/link"
import { ArrowRightIcon, InboxIcon, UploadCloudIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { ChartLineInteractive } from "@/components/chart-line-interactive"
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
import {
  DashboardCardsSkeleton,
  DashboardChartSkeleton,
  DashboardTableSkeleton,
} from "@/components/skeletons/dashboard-skeleton"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, Template } from "@/lib/types"

async function DashboardSummary() {
  const { imports } = await serverFetch<{ imports: ImportJob[] }>("/imports")
  const summary = imports.reduce(
    (acc, job) => ({
      good_count: acc.good_count + job.good_count,
      missing_count: acc.missing_count + job.missing_count,
      skipped_count: acc.skipped_count + job.skipped_count,
      ai_changed_count: acc.ai_changed_count + job.ai_changed_count,
    }),
    { good_count: 0, missing_count: 0, skipped_count: 0, ai_changed_count: 0 },
  )
  return <StatusCountCards summary={summary} />
}

async function DashboardChart() {
  const [{ imports }, { templates }] = await Promise.all([
    serverFetch<{ imports: ImportJob[] }>("/imports"),
    serverFetch<{ templates: Template[] }>("/templates"),
  ])
  return <ChartLineInteractive imports={imports} templates={templates} />
}

async function DashboardTable() {
  const [{ imports }, { templates }] = await Promise.all([
    serverFetch<{ imports: ImportJob[] }>("/imports"),
    serverFetch<{ templates: Template[] }>("/templates"),
  ])

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
                  <TableCell>{job.final_saved_count || job.good_count}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" render={<Link href={`/campaigns/${job.id}`} />}>
                      Open
                      <ArrowRightIcon />
                    </Button>
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

export default async function DashboardPage() {
  await requireCurrentUser()

  return (
    <AppShell
      title="Dashboard"
      description="Monitor imports, saved rows, templates, and AI cleaning history."
      actions={
        <Button render={<Link href="/upload" />}>
          <UploadCloudIcon />
          Upload
        </Button>
      }
    >
      <Suspense fallback={<DashboardCardsSkeleton />}>
        <DashboardSummary />
      </Suspense>
      <Suspense fallback={<DashboardChartSkeleton />}>
        <DashboardChart />
      </Suspense>
      <Suspense fallback={<DashboardTableSkeleton />}>
        <DashboardTable />
      </Suspense>
    </AppShell>
  )
}
