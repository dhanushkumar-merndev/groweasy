import Link from "next/link"
import { ArrowRightIcon, UploadCloudIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { StatusCountCards } from "@/components/status-count-cards"
import { TopNav } from "@/components/top-nav"
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
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function DashboardPage() {
  const user = await requireCurrentUser()
  const imports = store.listImports(user.id)
  const templates = store.listTemplates(user.id)
  const summary = imports.reduce(
    (totals, job) => ({
      good_count: totals.good_count + job.good_count,
      missing_count: totals.missing_count + job.missing_count,
      skipped_count: totals.skipped_count + job.skipped_count,
      ai_changed_count: totals.ai_changed_count + job.ai_changed_count,
    }),
    { good_count: 0, missing_count: 0, skipped_count: 0, ai_changed_count: 0 }
  )

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
      <TopNav isDemo={user.isDemo} />
      <StatusCountCards summary={summary} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
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
                {imports.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.file_name}</TableCell>
                    <TableCell>{templates.find((template) => template.id === job.template_id)?.name ?? "Template"}</TableCell>
                    <TableCell>{job.final_saved_count || job.good_count}</TableCell>
                    <TableCell>{job.status}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" render={<Link href={`/tables/${job.id}`} />}>
                        Open
                        <ArrowRightIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Production posture</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <p>Good and fixed rows are permanent. Unresolved missing rows stay in Redis preview cache.</p>
            <p>AI batches default to 75 rows with Groq primary and fallback model settings from env.</p>
            <p>Saved tables and analytics use imported data, not template definitions.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
