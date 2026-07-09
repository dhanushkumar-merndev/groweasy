import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Pool } from "pg"

import { logger } from "../../lib/logger.js"

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
    await pool.query(sql)
    logger.info("Database schema ensured")
  } catch (error: any) {
    if (error?.code === "42710") {
      logger.debug("Schema policies already exist (42710) — skipping")
    } else {
      logger.warn({ error }, "Failed to ensure DB schema — DB may not be available")
    }
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
