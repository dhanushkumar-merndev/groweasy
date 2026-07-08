import "server-only"

import { headers } from "next/headers"

import { demoUserId } from "@/lib/data/sample-data"
import { auth, isAuthConfigured } from "@/server/auth/auth"

export type CurrentUser = {
  id: string
  name: string
  email: string
  image?: string | null
  isDemo: boolean
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isAuthConfigured()) {
    return {
      id: demoUserId,
      name: "Demo User",
      email: "demo@groweasy.local",
      image: null,
      isDemo: true,
    }
  }

  const session = await auth.api
    .getSession({
      headers: await headers(),
    })
    .catch(() => null)

  if (!session?.user?.id) {
    return null
  }

  return {
    id: session.user.id,
    name: session.user.name ?? "User",
    email: session.user.email ?? "",
    image: session.user.image,
    isDemo: false,
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("UNAUTHORIZED")
  }

  return user
}
