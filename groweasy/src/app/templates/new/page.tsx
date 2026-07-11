import { AppShell } from "@/components/app-shell"
import { TemplateForm } from "@/components/template-form"
import { requireCurrentUser } from "@/lib/server-api"

export default async function NewTemplatePage() {
  await requireCurrentUser()

  return (
    <AppShell title="Create Template" description="Build a CRM-style schema with your own columns and formatting.">
      <TemplateForm />
    </AppShell>
  )
}
