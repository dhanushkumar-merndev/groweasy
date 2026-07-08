import { AppShell } from "@/components/app-shell"
import { TemplateForm } from "@/components/template-form"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string }>
}) {
  const user = await requireCurrentUser()
  const { duplicate } = await searchParams
  const template = duplicate ? store.getTemplate(user.id, duplicate) ?? undefined : undefined

  return (
    <AppShell title="New template" description="Create a reusable cleaning and export structure.">
      <TemplateForm template={template ? { ...template, id: "" } : undefined} />
    </AppShell>
  )
}
