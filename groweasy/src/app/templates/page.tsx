import Link from "next/link"
import { CopyIcon, EditIcon, PlusIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function TemplatesPage() {
  const user = await requireCurrentUser()
  const templates = store.listTemplates(user.id)

  return (
    <AppShell
      title="Templates"
      description="Define required fields, source hints, formatting rules, and export headers."
      actions={
        <Button render={<Link href="/templates/new" />}>
          <PlusIcon />
          New template
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{template.name}</span>
                <Badge variant="outline">{template.columns_config.length} columns</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                {template.columns_config.slice(0, 6).map((column) => (
                  <Badge key={column.key} variant={column.required ? "default" : "secondary"}>
                    {column.label}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" render={<Link href={`/templates/${template.id}/edit`} />}>
                  <EditIcon />
                  Edit
                </Button>
                <Button size="sm" variant="outline" render={<Link href={`/templates/new?duplicate=${template.id}`} />}>
                  <CopyIcon />
                  Duplicate
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
