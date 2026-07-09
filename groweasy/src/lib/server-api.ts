import "server-only"

import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"

import type { CurrentUser } from "@/lib/auth-types"

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"

export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: cookieStore.toString(),
    },
  })

  if (res.status === 404) notFound()
  if (!res.ok) {
    let body = ""
    try {
      body = await res.text()
    } catch {}
    throw new Error(`API_ERROR: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
  }
  return res.json()
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const data = await serverFetch<{ user: CurrentUser | null }>("/auth/me")
    return data.user
  } catch {
    return null
  }
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}
