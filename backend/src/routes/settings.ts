import { Router } from "express"
import { z } from "zod"

import { handleRouteError, jsonOk } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { encrypt, decrypt } from "../lib/crypto.js"
import { logger } from "../lib/logger.js"

const router = Router()

const saveSchema = z.object({
  provider: z.enum(["groq", "openai", "anthropic", "google", "together"]),
  model: z.string().min(1),
  key: z.string(),
})

router.post("/apikey", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { provider, model, key } = saveSchema.parse(req.body)
    const existing = getUserDecryptedKey(user.id)
    const actualKey = key || existing?.key || ""
    if (!actualKey) {
      return res.status(400).json({ error: "API key is required" })
    }
    const encrypted = encrypt(JSON.stringify({ provider, model, key: actualKey }))
    store.setApiKey(user.id, encrypted)
    logger.info({ userId: user.id, provider, model }, "API key saved")
    return jsonOk(res, { message: "API key saved" })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/apikey", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    store.deleteApiKey(user.id)
    logger.info({ userId: user.id }, "API key removed")
    return jsonOk(res, { message: "API key removed" })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.get("/apikey", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const raw = store.getApiKey(user.id)
    if (!raw) return jsonOk(res, { hasKey: false })
    const info = store.getApiKeyInfo(user.id)
    return jsonOk(res, { hasKey: true, provider: info?.provider ?? "", model: info?.model ?? "" })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export { router as default }

export function getUserDecryptedKey(userId: string): { provider: string; model: string; key: string } | null {
  const encrypted = store.getApiKey(userId)
  if (!encrypted) return null
  try {
    const decrypted = decrypt(encrypted)
    return JSON.parse(decrypted)
  } catch {
    return null
  }
}
