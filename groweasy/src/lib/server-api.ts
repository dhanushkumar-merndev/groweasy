import "server-only"

import { createHash } from "node:crypto"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"

import type { CurrentUser } from "@/lib/auth-types"

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"
const AUTH_CACHE_TTL_MS = 10 * 60 * 1000

type AuthCacheEntry = {
  expiresAt: number
  user: CurrentUser | null
}

const authCache = globalThis as typeof globalThis & {
  __groweasyAuthCache?: Map<string, AuthCacheEntry>
}

function getAuthCache() {
  authCache.__groweasyAuthCache ??= new Map<string, AuthCacheEntry>()
  return authCache.__groweasyAuthCache
}

function authCacheKey(cookieHeader: string) {
  const token = getCookie(cookieHeader, "better-auth.session_token") ?? getCookie(cookieHeader, "__Secure-better-auth.session_token")
  return token ? createHash("sha256").update(token).digest("hex") : null
}

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

export async function getCurrentUser(options: { cache?: boolean } = {}): Promise<CurrentUser | null> {
  try {
    const useCache = options.cache ?? true
    const cookieHeader = (await cookies()).toString()
    const key = useCache ? authCacheKey(cookieHeader) : null
    const cache = getAuthCache()

    if (key) {
      const cached = cache.get(key)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.user
      }
    }

    const data = await serverFetch<{ user: CurrentUser | null }>("/auth/me")
    if (key) {
      cache.set(key, { user: data.user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS })
    }
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

function getCookie(cookieHeader: string, name: string) {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=")
    if (rawName !== name || rawValue.length === 0) continue

    const value = rawValue.join("=")
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return null
}
