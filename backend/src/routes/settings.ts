import { Router } from "express"
import { z } from "zod"

import { handleRouteError, jsonOk } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { encrypt, decrypt } from "../lib/crypto.js"
import { logger } from "../lib/logger.js"
import { getSupabaseServiceClient } from "../server/db/supabase.js"

const router = Router()

const DEFAULT_AI_BATCH_SIZE = clampNumber(Number(process.env.AI_BATCH_SIZE ?? 15), 5, 100, 15)
const DEFAULT_AI_REQUEST_BATCH_SIZE = clampNumber(Number(process.env.AI_REQUEST_BATCH_SIZE ?? 15), 1, 30, 15)
const AI_BATCH_LIMITS = {
  batchSize: { min: 5, max: 100, default: DEFAULT_AI_BATCH_SIZE },
  requestBatchSize: { min: 1, max: 30, default: DEFAULT_AI_REQUEST_BATCH_SIZE },
}

const saveSchema = z.object({
  provider: z.enum(["groq", "openai", "anthropic", "google", "together"]),
  model: z.string().min(1),
  key: z.string(),
})

const aiSettingsSchema = z.object({
  batchSize: z.coerce.number().int().min(AI_BATCH_LIMITS.batchSize.min).max(AI_BATCH_LIMITS.batchSize.max),
  requestBatchSize: z.coerce.number().int().min(AI_BATCH_LIMITS.requestBatchSize.min).max(AI_BATCH_LIMITS.requestBatchSize.max),
})

const apiKeyModeSchema = z.object({
  useUserApiKey: z.boolean(),
})

const reviewModeSchema = z.object({
  detailedReviewEnabled: z.boolean(),
})

router.post("/apikey", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { provider, model, key } = saveSchema.parse(req.body)
    const existing = await getUserDecryptedKey(user.id)
    const actualKey = key || existing?.key || ""
    if (!actualKey) {
      return res.status(400).json({ error: "API key is required" })
    }
    const encrypted = encrypt(actualKey)
    await upsertUserAiSettings(user.id, {
      provider,
      model,
      encrypted_api_key: encrypted,
    })
    const legacyEncrypted = encrypt(JSON.stringify({ provider, model, key: actualKey }))
    store.setApiKey(user.id, legacyEncrypted)
    logger.info({ userId: user.id, provider, model }, "API key saved")
    return jsonOk(res, { message: "API key saved" })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/apikey", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    await upsertUserAiSettings(user.id, {
      encrypted_api_key: null,
      use_user_api_key: false,
    })
    store.deleteApiKey(user.id)
    logger.info({ userId: user.id }, "API key removed")
    return jsonOk(res, { message: "API key removed" })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/apikey/mode", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { useUserApiKey } = apiKeyModeSchema.parse(req.body)
    await upsertUserAiSettings(user.id, { use_user_api_key: useUserApiKey })
    store.setUseUserApiKey(user.id, useUserApiKey)
    return jsonOk(res, { useUserApiKey })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/review-mode", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { detailedReviewEnabled } = reviewModeSchema.parse(req.body)
    await upsertUserAiSettings(user.id, { detailed_review_enabled: detailedReviewEnabled })
    return jsonOk(res, { detailedReviewEnabled })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.get("/apikey", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const settings = await getDbUserAiSettings(user.id)
    const legacyRaw = store.getApiKey(user.id)
    const useUserApiKey = settings?.use_user_api_key ?? store.getUseUserApiKey(user.id)
    if (!settings?.encrypted_api_key && !legacyRaw) return jsonOk(res, { hasKey: false, useUserApiKey })
    const legacyInfo = legacyRaw ? await getUserDecryptedKey(user.id) : null
    return jsonOk(res, {
      hasKey: true,
      maskedKey: "********",
      provider: settings?.provider ?? legacyInfo?.provider ?? "groq",
      model: settings?.model ?? legacyInfo?.model ?? "openai/gpt-oss-120b",
      useUserApiKey,
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.get("/ai", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const activeProfile = await getActiveAiProfile(user.id)
    const recommendation = getAiTuningRecommendation(activeProfile.model)

    return jsonOk(res, {
      settings: await getUserAiSettings(user.id),
      limits: AI_BATCH_LIMITS,
      activeProfile,
      recommendation,
      groqReference: {
        free: {
          rpm: 30,
          rpd: 1000,
          tpm: 8000,
          note: "Free-plan limits vary by model/account. Check the Groq console for exact current limits.",
        },
        developer: {
          rpm: 1000,
          tpm: 250000,
          note: "Developer-plan reference for openai/gpt-oss-120b from Groq model docs.",
        },
      },
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/ai", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const parsed = aiSettingsSchema.parse(req.body)
    const settings = normalizeAiSettings(parsed)
    await upsertUserAiSettings(user.id, {
      batch_size: settings.batchSize,
      request_batch_size: settings.requestBatchSize,
    })
    store.setAiSettings(user.id, settings)
    return jsonOk(res, { settings, limits: AI_BATCH_LIMITS })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export { router as default }

export async function getUserDecryptedKey(userId: string): Promise<{ provider: string; model: string; key: string } | null> {
  const settings = await getDbUserAiSettings(userId)
  if (settings?.encrypted_api_key) {
    try {
      return {
        provider: settings.provider,
        model: settings.model,
        key: decrypt(settings.encrypted_api_key),
      }
    } catch {
      return null
    }
  }

  const encrypted = store.getApiKey(userId)
  if (!encrypted) return null
  try {
    const decrypted = decrypt(encrypted)
    return JSON.parse(decrypted)
  } catch {
    return null
  }
}

export async function shouldUseUserApiKey(userId: string) {
  const settings = await getDbUserAiSettings(userId)
  return settings?.use_user_api_key ?? store.getUseUserApiKey(userId)
}

async function getActiveAiProfile(userId: string) {
  const userKey = await shouldUseUserApiKey(userId) ? await getUserDecryptedKey(userId) : null

  return userKey
    ? {
        source: "user" as const,
        provider: userKey.provider,
        model: userKey.model,
      }
    : {
        source: "default" as const,
        provider: "groq",
        model: process.env.PRIMARY_AI_MODEL ?? "openai/gpt-oss-120b",
      }
}

function getAiTuningRecommendation(model: string) {
  const normalized = model.toLowerCase()

  if (
    normalized.includes("gpt-oss-120b") ||
    normalized.includes("70b") ||
    normalized.includes("llama-4-scout") ||
    normalized.includes("17b")
  ) {
    return {
      batchSize: 8,
      requestBatchSize: 8,
      label: "Free-tier safe",
      note: "Best first choice for large Groq models under strict TPM limits.",
    }
  }

  if (normalized.includes("8b") || normalized.includes("9b") || normalized.includes("mini") || normalized.includes("flash")) {
    return {
      batchSize: 15,
      requestBatchSize: 15,
      label: "Fast small-model",
      note: "Small/fast models can usually handle larger batches.",
    }
  }

  return {
    batchSize: 10,
    requestBatchSize: 10,
    label: "Balanced",
    note: "Safer default for unknown model limits.",
  }
}

export async function getUserAiSettings(userId: string): Promise<{ batchSize: number; requestBatchSize: number; detailedReviewEnabled: boolean }> {
  const dbSettings = await getDbUserAiSettings(userId)
  const normalized = normalizeAiSettings(dbSettings?.batch_size && dbSettings?.request_batch_size ? {
    batchSize: dbSettings.batch_size,
    requestBatchSize: dbSettings.request_batch_size,
  } : store.getAiSettings(userId) ?? {
    batchSize: DEFAULT_AI_BATCH_SIZE,
    requestBatchSize: DEFAULT_AI_REQUEST_BATCH_SIZE,
  })

  return {
    ...normalized,
    detailedReviewEnabled: dbSettings?.detailed_review_enabled ?? true,
  }
}

type DbUserAiSettings = {
  user_id: string
  provider: string
  model: string
  encrypted_api_key: string | null
  use_user_api_key: boolean
  detailed_review_enabled: boolean
  batch_size: number | null
  request_batch_size: number | null
}

async function getDbUserAiSettings(userId: string): Promise<DbUserAiSettings | null> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("user_id,provider,model,encrypted_api_key,use_user_api_key,detailed_review_enabled,batch_size,request_batch_size")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    logger.warn({ error, userId }, "Failed to load user AI settings from DB")
    return null
  }

  return data as DbUserAiSettings | null
}

async function upsertUserAiSettings(userId: string, patch: Partial<Omit<DbUserAiSettings, "user_id">>) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const { error } = await supabase
    .from("user_ai_settings")
    .upsert({
      user_id: userId,
      ...patch,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })

  if (error) {
    logger.warn({ error, userId }, "Failed to save user AI settings to DB")
    throw error
  }
}

function normalizeAiSettings(settings: { batchSize: number; requestBatchSize: number }) {
  const batchSize = clampNumber(settings.batchSize, AI_BATCH_LIMITS.batchSize.min, AI_BATCH_LIMITS.batchSize.max, DEFAULT_AI_BATCH_SIZE)
  const requestBatchSize = clampNumber(settings.requestBatchSize, AI_BATCH_LIMITS.requestBatchSize.min, AI_BATCH_LIMITS.requestBatchSize.max, DEFAULT_AI_REQUEST_BATCH_SIZE)

  return {
    batchSize,
    requestBatchSize: Math.min(requestBatchSize, batchSize),
  }
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}
