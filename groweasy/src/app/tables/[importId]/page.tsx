import { redirect } from "next/navigation"

export default async function LegacyTableRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>
  searchParams: Promise<{ sheet?: string }>
}) {
  const { importId } = await params
  const { sheet } = await searchParams
  redirect(`/campaigns/${importId}${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ""}`)
}
