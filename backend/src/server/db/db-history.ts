import { logger } from "../../lib/logger.js"
import { getSupabaseServiceClient } from "./supabase.js"

/**
 * History log persistence via Supabase service client.
 * All queries filter by userId — no cross-user data exposure.
 */

export async function addHistoryEntry(
  userId: string,
  importId: string | undefined,
  action: string,
  meta: Record<string, unknown>,
) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const { error } = await supabase
    .from("history_logs")
    .insert({
      user_id: userId,
      import_id: importId ?? null,
      action,
      meta,
    })

  if (error) {
    if (error.code === "23503") {
      logger.debug({ action, importId }, "Skipped DB history — import not synced to DB yet")
    } else {
      logger.warn({ error, action }, "Failed to insert history entry to DB")
    }
  }
}

export async function listHistoryEntries(userId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from("history_logs")
    .select("id,user_id,import_id,action,meta,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    logger.warn({ error }, "Failed to fetch history from DB")
    return null
  }

  return (data ?? []).map((row) => ({
    ...row,
    meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta,
  }))
}
