"use client"

export const USER_STORAGE_SCOPE_KEY = "groweasy-current-user-id"

export function setUserStorageScope(userId: string) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(USER_STORAGE_SCOPE_KEY, userId)
}

export function getUserStorageScope() {
  if (typeof window === "undefined") return "anonymous"
  return window.sessionStorage.getItem(USER_STORAGE_SCOPE_KEY) || "anonymous"
}

export function scopeStorageKey(key: string) {
  return `user:${getUserStorageScope()}:${key}`
}
