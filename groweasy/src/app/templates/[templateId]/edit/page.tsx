import { redirect } from "next/navigation"

import { requireCurrentUser } from "@/lib/server-api"

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  await params
  await requireCurrentUser()
  redirect("/templates")
}
