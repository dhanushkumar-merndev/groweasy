import Link from "next/link"
import { LockIcon, PlusIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Card, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { Template } from "@/lib/types"

export default async function TemplatesPage() {
  await requireCurrentUser()

  const { templates } = await serverFetch<{ templates: Template[] }>("/templates")

  return (
    <AppShell
      title="Templates"
      description="The default GrowEasy CRM lead schema used for every upload."
    >
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="h-fit py-0">
            <div className="grid gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>{template.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {template.columns_config.length} formatted fields
                  </p>
                </div>
                <Badge variant="outline">
                  {template.user_id === "demo-user" ? (
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
                Default CRM schema used for upload cleaning.
              </p>
            </div>
          </Card>
        ))}
        <Card className="h-fit border-dashed py-0">
          <Link
            href="/templates/new"
            className="flex flex-col items-center justify-center gap-3 p-6 text-center transition-colors hover:bg-muted/25"
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
    </AppShell>
  )
}
