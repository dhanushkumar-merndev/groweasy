import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { TemplateForm } from "@/components/template-form"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { Template } from "@/lib/types"

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireCurrentUser()
  const { templateId } = await params
  const { template } = await serverFetch<{ template: Template | null }>(`/templates/${templateId}`)

  if (!template) {
    notFound()
  }

  return (
    <AppShell title="Edit Template" description={template.name}>
      <TemplateForm template={template} />
    </AppShell>
  )
}
