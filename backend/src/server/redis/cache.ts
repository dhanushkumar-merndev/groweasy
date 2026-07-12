import { Redis } from "@upstash/redis"

import type { CacheEnvelope } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

/**
 * Redis-backed cache with in-memory fallback.
 *
 * Keys are scoped by importId and session hash — no user data is shared
 * across requests. In-memory Map is process-local (single instance).
 * If Redis is not configured, falls back to the in-memory cache silently.
 */

const TTL_SECONDS = 86_400
const LIST_CACHE_TTL_SECONDS = 120
const VERSION = "v1"
export const AUTH_USER_CACHE_TTL_SECONDS = 1_800

type MemoryRecord = {
  expiresAt: number
  value: CacheEnvelope<unknown>
}

const memoryCache = new Map<string, MemoryRecord>()

function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.REDIS_TOKEN

  if (!url || !token) {
    logger.info("Redis not configured, using in-memory cache")
    return null
  }

  logger.info("Redis client created")
  return new Redis({ url, token })
}

const redis = createRedisClient()

export async function setCache<T>(key: string, data: T, ttlSeconds = TTL_SECONDS) {
  const now = new Date()
  const envelope: CacheEnvelope<T> = {
    cached_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    version: VERSION,
    data,
  }

  if (redis) {
    await redis.set(key, envelope, { ex: ttlSeconds })
    return envelope
  }

  memoryCache.set(key, {
    expiresAt: now.getTime() + ttlSeconds * 1000,
    value: envelope,
  })

  return envelope
}

export async function getCache<T>(key: string, updatedAt?: string) {
  let envelope: CacheEnvelope<T> | null = null

  if (redis) {
    envelope = await redis.get<CacheEnvelope<T>>(key)
  } else {
    const record = memoryCache.get(key)

    if (record && record.expiresAt > Date.now()) {
      envelope = record.value as CacheEnvelope<T>
    }
  }

  if (!envelope || envelope.version !== VERSION) {
    return null
  }

  if (updatedAt && new Date(envelope.cached_at).getTime() < new Date(updatedAt).getTime()) {
    return null
  }

  return envelope.data
}

export async function deleteCache(key: string) {
  if (redis) {
    await redis.del(key)
    return
  }

  memoryCache.delete(key)
}

export function userListCacheKeys(userId: string) {
  return {
    imports: `user:${userId}:imports:list:v1`,
    templates: `user:${userId}:templates:list:v1`,
    historyExport: `user:${userId}:history:export:list:v1`,
    campaigns: `user:${userId}:campaigns:list:v1`,
  }
}

export async function getOrSetUserListCache<T>(
  key: string,
  load: () => Promise<T>,
  ttlSeconds = LIST_CACHE_TTL_SECONDS,
) {
  const cached = await getCache<T>(key)
  if (cached) return cached

  const data = await load()
  await setCache(key, data, ttlSeconds)
  return data
}

export async function invalidateUserListCaches(userId: string) {
  const keys = userListCacheKeys(userId)
  await Promise.all(Object.values(keys).map((key) => deleteCache(key)))
}

export async function invalidateImportCache(importId: string) {
  logger.debug({ importId }, "Invalidating import cache")
  await deleteCache(`import:${importId}:raw:v1`)
  await deleteCache(`import:${importId}:validation:v1`)
  await invalidateProcessedImportCache(importId)
}

export async function invalidateProcessedImportCache(importId: string) {
  logger.debug({ importId }, "Invalidating processed import cache")
  await deleteCache(`import:${importId}:formatted:v1`)
  await deleteCache(`import:${importId}:missing:v1`)
  await deleteCache(`import:${importId}:skipped:v1`)
  await deleteCache(`autocomplete:${importId}:v1`)

  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(`import:${importId}:batch:`) || key.startsWith(`analytics:${importId}:`)) {
      memoryCache.delete(key)
    }
  }
}

export async function invalidateAnalyticsCache(importId: string) {
  logger.debug({ importId }, "Invalidating analytics cache")
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(`analytics:${importId}:`)) {
      memoryCache.delete(key)
    }
  }
}

export function cacheKeys(importId: string) {
  return {
    raw: `import:${importId}:raw:v1`,
    validation: `import:${importId}:validation:v1`,
    formatted: `import:${importId}:formatted:v1`,
    missing: `import:${importId}:missing:v1`,
    skipped: `import:${importId}:skipped:v1`,
    autocomplete: `autocomplete:${importId}:v1`,
    batch: (batchNo: number) => `import:${importId}:batch:${batchNo}:v1`,
    analytics: (filterHash: string) => `analytics:${importId}:${filterHash}:v1`,
  }
}

export function authUserCacheKey(sessionHash: string) {
  return `auth:user:${sessionHash}:v1`
}
