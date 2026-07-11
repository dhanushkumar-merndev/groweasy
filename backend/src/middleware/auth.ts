import type { NextFunction, Request, Response } from "express"
import { fromNodeHeaders } from "better-auth/node"
import { createHash } from "node:crypto"

import { auth, isAuthConfigured } from "../server/auth/auth.js"
import { demoUserId } from "../lib/data/sample-data.js"
import { logger } from "../lib/logger.js"
import { AUTH_USER_CACHE_TTL_SECONDS, authUserCacheKey, getCache, setCache } from "../server/redis/cache.js"

export type CurrentUser = {
  id: string
  name: string
  email: string
  image?: string | null
  isDemo: boolean
}

export async function requireCurrentUser(req: Request): Promise<CurrentUser> {
  if (!isAuthConfigured()) {
    logger.info("Auth not configured, using demo user")
    return {
      id: demoUserId,
      name: "Demo User",
      email: "demo@groweasy.local",
      image: null,
      isDemo: true,
    }
  }

  const userCacheKey = getCurrentUserCacheKey(req.headers.cookie)
  const cachedUser = userCacheKey ? await getCache<CurrentUser>(userCacheKey) : null
  if (cachedUser?.id) {
    logger.debug({ userId: cachedUser.id, source: "redis" }, "User authenticated")
    return cachedUser
  }

  const session = await auth.api
    .getSession({
      headers: fromNodeHeaders(req.headers),
    })
    .catch(() => null)

  if (!session?.user?.id) {
    logger.warn({ url: req.url }, "No valid session found")
    throw new Error("UNAUTHORIZED")
  }

  const user = {
    id: session.user.id,
    name: session.user.name ?? "User",
    email: session.user.email ?? "",
    image: session.user.image,
    isDemo: false,
  }

  if (userCacheKey) {
    await setCache(userCacheKey, user, AUTH_USER_CACHE_TTL_SECONDS)
  }

  logger.info({ userId: session.user.id, source: "db" }, "User authenticated")
  return user
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  requireCurrentUser(req)
    .then((user) => {
      ;(req as unknown as Record<string, unknown>).user = user
      next()
    })
    .catch(() => {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Please sign in to continue." },
      })
    })
}

function getCurrentUserCacheKey(cookieHeader: string | undefined) {
  const token = getCookie(cookieHeader, "better-auth.session_token")
    ?? getCookie(cookieHeader, "__Secure-better-auth.session_token")

  if (!token) return null

  const sessionHash = createHash("sha256").update(token).digest("hex")
  return authUserCacheKey(sessionHash)
}

function getCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null

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
