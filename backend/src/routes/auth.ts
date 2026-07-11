import { Router } from "express"
import { fromNodeHeaders, toNodeHandler } from "better-auth/node"
import { decodeJwt } from "jose"

import { auth, isAuthConfigured } from "../server/auth/auth.js"
import { demoUserId } from "../lib/data/sample-data.js"
import { store } from "../server/repositories/store.js"
import { handleRouteError, jsonOk } from "../server/api.js"
import { logger } from "../lib/logger.js"
import { getSupabaseServiceClient } from "../server/db/supabase.js"

type GoogleIdTokenPayload = {
  picture?: unknown
}

const router = Router()

router.get("/config", (_req, res) => {
  return jsonOk(res, {
    auth: isAuthConfigured(),
    redis: Boolean(process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL),
    groq: Boolean(process.env.GROQ_API_KEY),
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

    const sessionImage = normalizeImageUrl(session.user.image)
    const image = sessionImage ?? await getGoogleProfileImage(session.user.id)

    return jsonOk(res, {
      user: {
        id: session.user.id,
        name: session.user.name ?? "User",
        email: session.user.email ?? "",
        image,
        isDemo: false,
      },
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.all("/*", toNodeHandler(auth))

export default router

async function getGoogleProfileImage(userId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from("account")
    .select("idToken")
    .eq("userId", userId)
    .eq("providerId", "google")
    .maybeSingle()

  if (error || !data?.idToken) {
    if (error) logger.warn({ error, userId }, "Could not load Google account image fallback")
    return null
  }

  try {
    const payload = decodeJwt(data.idToken) as GoogleIdTokenPayload
    const picture = normalizeImageUrl(payload.picture)

    if (picture) {
      void supabase
        .from("user")
        .update({ image: picture })
        .eq("id", userId)
        .then(({ error: updateError }) => {
          if (updateError) logger.warn({ error: updateError, userId }, "Could not persist Google profile image")
        })
    }

    return picture
  } catch {
    return null
  }
}

function normalizeImageUrl(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
