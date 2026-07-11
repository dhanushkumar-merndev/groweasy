import { betterAuth } from "better-auth"
import { multiSession } from "better-auth/plugins"
import { PostgresDialect } from "kysely"
import { Pool } from "pg"

import { logger } from "../../lib/logger.js"

const databaseUrl = process.env.DATABASE_URL
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000"
const authUrl = process.env.BETTER_AUTH_URL ?? frontendUrl
const trustedOrigins = [
  frontendUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean)

const database = databaseUrl
  ? new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
      }),
    })
  : undefined

export const auth = betterAuth({
  secret:
    process.env.BETTER_AUTH_SECRET ??
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
    database: {
      generateId: "uuid",
    },
  },
})

logger.info({ hasDb: Boolean(databaseUrl) }, "BetterAuth initialized")

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
