"use client"

import { useEffect } from "react"
import { purgeExpired } from "@/lib/idb-store"

export function IdbCleanup() {
  useEffect(() => {
    purgeExpired()
  }, [])
  return null
}
