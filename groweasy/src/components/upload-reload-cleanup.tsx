"use client"

import { useLayoutEffect } from "react"

export function UploadReloadCleanup() {
  useLayoutEffect(() => {
    try {
      const path = window.location.pathname
      const match = path.match(/^\/upload\/([^/]+)/)
      if (!match) return

      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      if (nav?.type !== "reload") return

      const draftKey = "groweasy-upload-draft"
      if (!window.sessionStorage.getItem(draftKey)) return

      const importId = match[1]
      window.sessionStorage.removeItem(draftKey)
      window.sessionStorage.removeItem("groweasy-upload-reset-on-reload")
      window.sessionStorage.removeItem(`groweasy-validation-preview:${importId}`)
      window.sessionStorage.removeItem(`groweasy-validate-state:${importId}`)
      window.location.replace("/upload")
    } catch {
      // Ignore storage access errors and let the app render normally.
    }
  }, [])

  return null
}
