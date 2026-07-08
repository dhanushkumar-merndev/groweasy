import { redirect } from "next/navigation"

import { requireCurrentUser } from "@/lib/server-api"

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string }>
}) {
  await requireCurrentUser()
  await searchParams
  redirect("/templates")
}
