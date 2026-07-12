import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Pool } from "pg"

import { logger } from "../../lib/logger.js"

/**
 * Database utilities — schema migration and history log persistence.
 *
 * Pool is created once at module level (cold start). History queries always
 * filter by userId — no cross-user data exposure.
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
})

export async function ensureSchema() {
  try {
    const schemaPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../groweasy/supabase/schema.sql",
    )
    const sql = readFileSync(schemaPath, "utf8")

    // Split into individual statements so a policy-already-exists error (42710)
    // doesn't roll back CREATE TABLE IF NOT EXISTS statements.
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)

    for (const stmt of statements) {
      try {
        await pool.query(`${stmt};`)
      } catch (error: any) {
        if (error?.code === "42710") {
          logger.debug("Schema policy already exists — skipping")
        } else if (error?.code === "42P07") {
          logger.debug("Schema object already exists — skipping")
        } else {
          logger.warn({ error, stmt: stmt.slice(0, 80) }, "Schema statement failed")
        }
      }
    }

    logger.info("Database schema ensured")
  } catch (error) {
    logger.warn({ error }, "Failed to ensure DB schema — DB may not be available")
  }
}

export async function addHistoryEntry(
  userId: string,
  importId: string | undefined,
  action: string,
  meta: Record<string, unknown>,
) {
  try {
    await pool.query(
      `INSERT INTO history_logs (user_id, import_id, action, meta) VALUES ($1, $2, $3, $4)`,
      [userId, importId ?? null, action, JSON.stringify(meta)],
    )
  } catch (error: any) {
    if (error?.code === "23503") {
      logger.debug({ action, importId }, "Skipped DB history — import not synced to DB yet")
    } else {
      logger.warn({ error, action }, "Failed to insert history entry to DB")
    }
  }
}

export async function listHistoryEntries(userId: string) {
  try {
    const result = await pool.query(
      `SELECT id, user_id, import_id, action, meta, created_at
       FROM history_logs
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    )
    return result.rows.map((row) => ({
      ...row,
      meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta,
    }))
  } catch (error) {
    logger.warn({ error }, "Failed to fetch history from DB")
    return null
  }
}
