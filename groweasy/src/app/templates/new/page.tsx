import { AppShell } from "@/components/app-shell"
import { TemplateForm } from "@/components/template-form"

export default async function NewTemplatePage() {

  return (
    <AppShell title="Create Template" description="Build a CRM-style schema with your own columns and formatting.">
      <TemplateForm />
    </AppShell>
  )
}
