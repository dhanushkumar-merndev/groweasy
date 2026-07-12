import { betterAuth } from "better-auth"
import { multiSession } from "better-auth/plugins"
import { PostgresDialect } from "kysely"
import { Pool } from "pg"

import { logger } from "../../lib/logger.js"

/**
 * Better Auth configuration — Google OAuth via Kysely/Postgres.
 *
 * Module-level side effects:
 * - Creates a pg Pool if DATABASE_URL is configured
 * - Exports a configured betterAuth instance for the Express auth router
 * - Exports isAuthConfigured() for the login page config check
 */

const databaseUrl = process.env.DATABASE_URL
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000"
const authUrl = process.env.BETTER_AUTH_URL ?? frontendUrl
const trustedOrigins = [
  authUrl,
  frontendUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean)

const database = databaseUrl
  ? new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    })
  : undefined

const betterAuthSecret = process.env.BETTER_AUTH_SECRET

if (!betterAuthSecret) {
  if (process.env.NODE_ENV === "production") {
    logger.error("BETTER_AUTH_SECRET is required in production")
    throw new Error("BETTER_AUTH_SECRET is required in production")
  }
  logger.warn("BETTER_AUTH_SECRET not set, using dev fallback — DO NOT use in production")
}

export const auth = betterAuth({
  secret:
    betterAuthSecret ??
    "development-only-secret-change-before-production-32-characters",
  baseURL: authUrl,
  trustedOrigins,
  database,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "missing-google-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "missing-google-client-secret",
      prompt: "select_account",
    },
  },
  plugins: [
    multiSession({
      maximumSessions: 5,
    }),
  ],
  advanced: {
    ipAddress: {
      ipAddressHeaders: [
        "cf-connecting-ip",
        "x-real-ip",
        "x-forwarded-for",
      ],
      trustedProxies: [
        "loopback",
        "linklocal",
        "uniquelocal",
      ],
    },
    database: {
      generateId: "uuid",
    },
  },
})

logger.info({ hasDb: Boolean(databaseUrl) }, "BetterAuth initialized")

/**
 * Returns true when all required OAuth env vars are set.
 * Used by GET /api/auth/config to inform the frontend login page.
 */
export function isAuthConfigured() {
  const configured = Boolean(
    process.env.BETTER_AUTH_SECRET &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.DATABASE_URL
  )
  logger.debug({ configured }, "Auth configuration check")
  return configured
}
