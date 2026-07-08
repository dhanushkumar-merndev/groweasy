import { Redis } from "@upstash/redis"

import type { CacheEnvelope } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

const TTL_SECONDS = 86_400
const VERSION = "v1"

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

export async function invalidateImportCache(importId: string) {
  logger.debug({ importId }, "Invalidating import cache")
  await deleteCache(`import:${importId}:raw:v1`)
  await deleteCache(`import:${importId}:validation:v1`)
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
