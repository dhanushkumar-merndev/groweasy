import type { NextFunction, Request, Response } from "express"
import { fromNodeHeaders } from "better-auth/node"

import { auth, isAuthConfigured } from "../server/auth/auth.js"
import { demoUserId } from "../lib/data/sample-data.js"

export type CurrentUser = {
  id: string
  name: string
  email: string
  image?: string | null
  isDemo: boolean
}

export async function requireCurrentUser(req: Request): Promise<CurrentUser> {
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
      headers: fromNodeHeaders(req.headers),
    })
    .catch(() => null)

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED")
  }

  return {
    id: session.user.id,
    name: session.user.name ?? "User",
    email: session.user.email ?? "",
    image: session.user.image,
    isDemo: false,
  }
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
