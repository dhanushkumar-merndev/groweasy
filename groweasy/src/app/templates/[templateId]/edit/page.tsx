import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { TemplateForm } from "@/components/template-form"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const user = await requireCurrentUser()
  const template = store.getTemplate(user.id, templateId)

  if (!template) {
    notFound()
  }

  return (
    <AppShell title="Edit template" description="Adjust required fields, source hints, and formatting rules.">
      <TemplateForm template={template} />
    </AppShell>
  )
}
