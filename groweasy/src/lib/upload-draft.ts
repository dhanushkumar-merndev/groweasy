import type { ParsedRawUpload } from "@/lib/raw-batch-parser"

export type UploadDraftFile = {
  name: string
  size: number
  parsed: ParsedRawUpload
}

export type UploadDraft = {
  templateId: string
  files: UploadDraftFile[]
}

export const UPLOAD_DRAFT_KEY = "groweasy-upload-draft"
const UPLOAD_RESET_ON_RELOAD_KEY = "groweasy-upload-reset-on-reload"
const VALIDATION_PREVIEW_KEY_PREFIX = "groweasy-validation-preview:"
const VALIDATE_STATE_KEY_PREFIX = "groweasy-validate-state:"
const REACHED_STEP_KEY_PREFIX = "groweasy-import-reached-step:"
const REVIEW_DRAFT_KEY_PREFIX = "groweasy-review-draft:"
let hardReloadResetConsumed = false

export function readUploadDraft() {
  if (typeof window === "undefined") {
    return null
  }

  const rawDraft = window.sessionStorage.getItem(UPLOAD_DRAFT_KEY)

  if (!rawDraft) {
    return null
  }

  try {
    const parsedDraft = JSON.parse(rawDraft) as UploadDraft
    return parsedDraft.files.length > 0 ? parsedDraft : null
  } catch {
    clearUploadDraft()
    return null
  }
}

export function hasUploadDraft() {
  return readUploadDraft() !== null
}

export function isHardReloadNavigation() {
  if (typeof window === "undefined") {
    return false
  }

  const navigationEntry = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
  return navigationEntry?.type === "reload"
}

export function consumeHardReloadNavigationReset() {
  if (hardReloadResetConsumed || !isHardReloadNavigation()) {
    return false
  }

  hardReloadResetConsumed = true
  return true
}

export function clearUploadDraft() {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.removeItem(UPLOAD_DRAFT_KEY)
}

export function markUploadResetOnUnload(importId?: string) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem(
    UPLOAD_RESET_ON_RELOAD_KEY,
    JSON.stringify({
      importId: importId ?? null,
      createdAt: Date.now(),
    }),
  )
}

export function consumeUploadResetOnReload(importId?: string) {
  if (typeof window === "undefined") {
    return false
  }

  const rawMarker = window.sessionStorage.getItem(UPLOAD_RESET_ON_RELOAD_KEY)

  if (!rawMarker) {
    return false
  }

  try {
    const marker = JSON.parse(rawMarker) as { importId?: string | null; createdAt?: number }
    const isStale = typeof marker.createdAt === "number" && Date.now() - marker.createdAt > 5 * 60 * 1000
    const appliesToImport = !marker.importId || !importId || marker.importId === importId

    if (isStale || !appliesToImport) {
      window.sessionStorage.removeItem(UPLOAD_RESET_ON_RELOAD_KEY)
      return false
    }

    window.sessionStorage.removeItem(UPLOAD_RESET_ON_RELOAD_KEY)
    return true
  } catch {
    window.sessionStorage.removeItem(UPLOAD_RESET_ON_RELOAD_KEY)
    return false
  }
}

export function clearUploadSession(importId?: string) {
  if (typeof window === "undefined") {
    return
  }

  clearUploadDraft()
  window.sessionStorage.removeItem(UPLOAD_RESET_ON_RELOAD_KEY)

  const LOCAL_IMPORT_PREFIX = "groweasy-local-import:"

  if (importId) {
    window.sessionStorage.removeItem(`${VALIDATION_PREVIEW_KEY_PREFIX}${importId}`)
    window.sessionStorage.removeItem(`${VALIDATE_STATE_KEY_PREFIX}${importId}`)
    window.sessionStorage.removeItem(`${REACHED_STEP_KEY_PREFIX}${importId}`)
    window.sessionStorage.removeItem(`${REVIEW_DRAFT_KEY_PREFIX}${importId}`)
    window.sessionStorage.removeItem(`${LOCAL_IMPORT_PREFIX}${importId}`)
    return
  }

  for (const key of Object.keys(window.sessionStorage)) {
    if (
      key.startsWith(VALIDATION_PREVIEW_KEY_PREFIX) ||
      key.startsWith(VALIDATE_STATE_KEY_PREFIX) ||
      key.startsWith(REACHED_STEP_KEY_PREFIX) ||
      key.startsWith(REVIEW_DRAFT_KEY_PREFIX) ||
      key.startsWith(LOCAL_IMPORT_PREFIX)
    ) {
      window.sessionStorage.removeItem(key)
    }
  }
}
