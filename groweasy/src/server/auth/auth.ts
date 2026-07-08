import "server-only"

import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { PostgresDialect } from "kysely"
import { Pool } from "pg"

const databaseUrl = process.env.DATABASE_URL

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
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "missing-google-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "missing-google-client-secret",
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  plugins: [nextCookies()],
})

export function isAuthConfigured() {
  return Boolean(
    process.env.BETTER_AUTH_SECRET &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.DATABASE_URL
  )
}
