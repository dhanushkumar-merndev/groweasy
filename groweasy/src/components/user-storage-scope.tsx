"use client"

import { useEffect } from "react"

import { setUserStorageScope } from "@/lib/user-storage-scope"

export function UserStorageScope({ userId }: { userId: string }) {
  useEffect(() => {
    setUserStorageScope(userId)
  }, [userId])

  return null
}
