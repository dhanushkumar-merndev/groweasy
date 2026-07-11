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

  const isDemo = (template: Template) => template.user_id === "demo-user"

  return (
    <AppShell
      title="Templates"
      description="The default GrowEasy CRM lead schema used for every upload."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const inner = (
            <div className="flex flex-col gap-4 p-4 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>{template.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {template.columns_config.length} formatted fields
                  </p>
                </div>
                <Badge variant="outline">
                  {isDemo(template) ? (
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
                {isDemo(template)
                  ? "Default CRM schema used for upload cleaning."
                  : "Custom schema for upload cleaning."}
              </p>
            </div>
          )

          if (isDemo(template)) {
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
    </AppShell>
  )
}
