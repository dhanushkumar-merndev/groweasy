import { Router } from "express"
import { fromNodeHeaders, toNodeHandler } from "better-auth/node"

import { auth, isAuthConfigured } from "../server/auth/auth.js"
import { demoUserId } from "../lib/data/sample-data.js"
import { store } from "../server/repositories/store.js"
import { handleRouteError, jsonOk } from "../server/api.js"
import { logger } from "../lib/logger.js"

const router = Router()

router.get("/config", (_req, res) => {
  return jsonOk(res, {
    auth: isAuthConfigured(),
    redis: Boolean(process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL),
    groq: Boolean(
      process.env.GROQ_MODEL_1 ??
        process.env.GROQ_MODEL_2 ??
        process.env.GROQ_MODEL_3 ??
        process.env.GROQ_API_KEY
    ),
  })
})

router.get("/me", async (req, res) => {
  try {
    if (!isAuthConfigured()) {
      return jsonOk(res, {
        user: {
          id: demoUserId,
          name: "Demo User",
          email: "demo@groweasy.local",
          image: null,
          isDemo: true,
        },
      })
    }

    const session = await auth.api
      .getSession({ headers: fromNodeHeaders(req.headers) })
      .catch(() => null)

    if (!session?.user?.id) {
      logger.info("No active session for /auth/me")
      return jsonOk(res, { user: null })
    }

    return jsonOk(res, {
      user: {
        id: session.user.id,
        name: session.user.name ?? "User",
        email: session.user.email ?? "",
        image: session.user.image,
        isDemo: false,
      },
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.all("/*", toNodeHandler(auth))

export default router
