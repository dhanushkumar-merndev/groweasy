import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { TemplateFormSkeleton } from "@/components/skeletons/page-skeletons"
import { TemplateForm } from "@/components/template-form"
import { serverFetch } from "@/lib/server-api"
import type { Template } from "@/lib/types"

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params

  return (
    <AppShell title="Edit Template" description="Update CRM columns and formatting rules.">
      <Suspense fallback={<TemplateFormSkeleton />}>
        <EditTemplateContent templateId={templateId} />
      </Suspense>
    </AppShell>
  )
}

async function EditTemplateContent({ templateId }: { templateId: string }) {
  const { template } = await serverFetch<{ template: Template | null }>(`/templates/${templateId}`)

  if (!template) {
    redirect("/templates")
  }

  return (
    <>
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-normal">{template.name}</h2>
        <p className="text-sm text-muted-foreground">Update CRM columns and formatting rules.</p>
      </div>
      <TemplateForm template={template} />
    </>
  )
}
