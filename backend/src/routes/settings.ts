import { Router } from "express"
import { z } from "zod"

import { handleRouteError, jsonOk } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { encrypt, decrypt } from "../lib/crypto.js"
import { logger } from "../lib/logger.js"
import { getSupabaseServiceClient } from "../server/db/supabase.js"

/**
 * Settings route — user AI API key management and batch tuning.
 *
 * POST  /apikey        — Save user AI provider key (encrypted at rest)
 * DELETE /apikey       — Remove saved key
 * POST  /apikey/mode   — Toggle use-user-key vs platform default
 * POST  /review-mode   — Toggle detailed AI review mode
 * GET   /apikey        — Get masked key status
 * GET   /ai            — Get AI batch settings and recommendations
 * POST  /ai            — Update AI batch/request batch sizes
 *
 * Exports: getUserDecryptedKey(), shouldUseUserApiKey(), hasActiveUserApiKey(),
 *          getUserAiSettings()
 */

const router = Router()

const AI_BATCH_LIMITS_BASE = {
  batchSize: { min: 5, max: 100 },
  requestBatchSize: { min: 1, max: 30 },
}
const FALLBACK_AI_BATCH_DEFAULTS = readProviderBatchDefaults("AI", 15, 15)
const AI_BATCH_LIMITS = {
  batchSize: { ...AI_BATCH_LIMITS_BASE.batchSize, default: FALLBACK_AI_BATCH_DEFAULTS.batchSize },
  requestBatchSize: { ...AI_BATCH_LIMITS_BASE.requestBatchSize, default: FALLBACK_AI_BATCH_DEFAULTS.requestBatchSize },
}

const saveSchema = z.object({
  provider: z.enum(["groq", "commandcode", "cloudflare"]),
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
      use_user_api_key: true,
    })
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
    const useUserApiKey = settings?.use_user_api_key ?? false
    if (!settings?.encrypted_api_key) {
      return jsonOk(res, { hasKey: false, isActive: false, useUserApiKey })
    }
    const hasKey = Boolean(settings?.encrypted_api_key)
    return jsonOk(res, {
      hasKey,
      isActive: Boolean(hasKey && useUserApiKey),
      maskedKey: "********",
      provider: normalizeSupportedProvider(settings?.provider ?? "cloudflare"),
      model: settings?.model ?? "@cf/google/gemma-4-26b-a4b-it",
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
    const defaultSettings = getDefaultAiSettingsForProvider(activeProfile.provider)

    return jsonOk(res, {
      settings: await getUserAiSettings(user.id),
      limits: getAiBatchLimits(defaultSettings),
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
    return jsonOk(res, {
      settings: await getUserAiSettings(user.id),
      limits: AI_BATCH_LIMITS,
    })
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

  return null
}

export async function shouldUseUserApiKey(userId: string) {
  const settings = await getDbUserAiSettings(userId)
  return settings?.use_user_api_key ?? false
}

export async function hasActiveUserApiKey(userId: string) {
  const [useUserKey, userKey] = await Promise.all([
    shouldUseUserApiKey(userId),
    getUserDecryptedKey(userId),
  ])

  logger.debug({
    userId,
    useUserKey,
    hasUserKey: Boolean(userKey?.key),
    provider: userKey?.provider,
    model: userKey?.model,
  }, "Resolved active user API key")

  return Boolean(useUserKey && userKey?.key)
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
        provider: normalizeSupportedProvider(process.env.AI_PROCESS_PROVIDER ?? process.env.ROW_AI_PROVIDER ?? "cloudflare"),
        model: process.env.AI_PROCESS_MODEL ?? process.env.ROW_AI_MODEL ?? process.env.CLOUDFLARE_AI_MODEL ?? "@cf/google/gemma-4-26b-a4b-it",
      }
}

function getAiTuningRecommendation(model: string) {
  const normalized = model.toLowerCase()

  if (
    normalized.includes("gpt-oss-120b") ||
    normalized.includes("deepseek-v4-pro") ||
    normalized.includes("kimi") ||
    normalized.includes("glm-5") ||
    normalized.includes("70b") ||
    normalized.includes("llama-4-scout") ||
    normalized.includes("17b") ||
    normalized.includes("gemma-4-26b")
  ) {
    return {
      batchSize: 8,
      requestBatchSize: 8,
      label: "Quality safe",
      note: "Good first choice for larger models and stricter JSON reliability.",
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

function normalizeSupportedProvider(provider: string) {
  const normalized = provider.toLowerCase().replace(/[\s_-]/g, "")
  if (normalized === "cloudflare" || normalized === "workersai") return "cloudflare"
  return normalized === "commandcode" ? "commandcode" : "groq"
}

export async function getUserAiSettings(userId: string): Promise<{ batchSize: number; requestBatchSize: number; detailedReviewEnabled: boolean }> {
  const dbSettings = await getDbUserAiSettings(userId)
  const userKey = dbSettings?.use_user_api_key ? await getUserDecryptedKey(userId) : null

  if (!userKey) {
    return {
      batchSize: 5,
      requestBatchSize: 5,
      detailedReviewEnabled: dbSettings?.detailed_review_enabled ?? true,
    }
  }

  const activeProvider = normalizeSupportedProvider(
    userKey.provider ||
      process.env.AI_PROCESS_PROVIDER ||
      process.env.ROW_AI_PROVIDER ||
      "cloudflare"
  )
  const defaultSettings = getDefaultAiSettingsForProvider(activeProvider)
  const normalized = normalizeAiSettings(dbSettings?.batch_size && dbSettings?.request_batch_size ? {
    batchSize: dbSettings.batch_size,
    requestBatchSize: dbSettings.request_batch_size,
  } : defaultSettings, defaultSettings)

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

function isMissingUserAiSettingsTable(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "PGRST205"
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
    // Older Supabase environments may not have the table yet. Reads should
    // fall back quietly so the settings page can still render.
    if (isMissingUserAiSettingsTable(error)) {
      return null
    }

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
    if (isMissingUserAiSettingsTable(error)) {
      throw new Error("Supabase table public.user_ai_settings is missing. Apply the latest database migration before saving settings.")
    }

    logger.warn({ error, userId }, "Failed to save user AI settings to DB")
    throw error
  }
}

function getDefaultAiSettingsForProvider(provider: string) {
  const normalizedProvider = normalizeSupportedProvider(provider)
  const prefix = normalizedProvider === "cloudflare" ? "CLOUDFLARE" : normalizedProvider === "commandcode" ? "COMMAND_CODE" : "GROQ"
  const fallbackBatchSize = normalizedProvider === "groq" ? 8 : FALLBACK_AI_BATCH_DEFAULTS.batchSize
  const fallbackRequestBatchSize = normalizedProvider === "groq" ? 8 : FALLBACK_AI_BATCH_DEFAULTS.requestBatchSize

  return readProviderBatchDefaults(prefix, fallbackBatchSize, fallbackRequestBatchSize)
}

function readProviderBatchDefaults(prefix: string, fallbackBatchSize: number, fallbackRequestBatchSize: number) {
  const batchSize = clampNumber(
    Number(process.env[`${prefix}_AI_BATCH_SIZE`] ?? (prefix === "AI" ? undefined : process.env.AI_BATCH_SIZE) ?? fallbackBatchSize),
    AI_BATCH_LIMITS_BASE.batchSize.min,
    AI_BATCH_LIMITS_BASE.batchSize.max,
    fallbackBatchSize
  )
  const requestBatchSize = clampNumber(
    Number(process.env[`${prefix}_AI_REQUEST_BATCH_SIZE`] ?? (prefix === "AI" ? undefined : process.env.AI_REQUEST_BATCH_SIZE) ?? fallbackRequestBatchSize),
    AI_BATCH_LIMITS_BASE.requestBatchSize.min,
    AI_BATCH_LIMITS_BASE.requestBatchSize.max,
    fallbackRequestBatchSize
  )

  return {
    batchSize,
    requestBatchSize: Math.min(requestBatchSize, batchSize),
  }
}

function getAiBatchLimits(defaults: { batchSize: number; requestBatchSize: number }) {
  return {
    batchSize: { ...AI_BATCH_LIMITS_BASE.batchSize, default: defaults.batchSize },
    requestBatchSize: { ...AI_BATCH_LIMITS_BASE.requestBatchSize, default: defaults.requestBatchSize },
  }
}

function normalizeAiSettings(
  settings: { batchSize: number; requestBatchSize: number },
  defaults = FALLBACK_AI_BATCH_DEFAULTS
) {
  const batchSize = clampNumber(settings.batchSize, AI_BATCH_LIMITS.batchSize.min, AI_BATCH_LIMITS.batchSize.max, defaults.batchSize)
  const requestBatchSize = clampNumber(settings.requestBatchSize, AI_BATCH_LIMITS.requestBatchSize.min, AI_BATCH_LIMITS.requestBatchSize.max, defaults.requestBatchSize)

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
