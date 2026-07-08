import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { logger } from "../../lib/logger.js"

let serviceClient: SupabaseClient | null = null

export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    logger.warn("Supabase not configured")
    return null
  }

  if (!serviceClient) {
    logger.info("Initializing Supabase service client")
    serviceClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return serviceClient
}

export function isSupabaseConfigured() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  logger.debug({ configured }, "Supabase configuration check")
  return configured
}
