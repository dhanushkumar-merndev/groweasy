import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{template.name}</span>
                <Badge variant="outline">Default</Badge>
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
              <p className="text-xs text-muted-foreground">
                Locked schema. Uploads use this template for CRM lead extraction.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
