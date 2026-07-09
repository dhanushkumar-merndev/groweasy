import type { RawBatchRow } from "@/lib/raw-batch-parser"
import type { UploadDraftFile } from "@/lib/upload-draft"
import { idbGet, idbSet, idbDelete } from "@/lib/idb-store"

export type LocalImportData = {
  templateId: string
  templateName: string
  fileName: string
  files?: UploadDraftFile[]
  rows: RawBatchRow[]
  sheets: { name: string; rows: number }[]
  totalRows: number
}

const KEY_PREFIX = "groweasy-local-import:"
const memoryCache = new Map<string, LocalImportData>()

export function saveLocalImport(id: string, data: LocalImportData) {
  if (typeof window === "undefined") return
  memoryCache.set(id, data)
  idbSet(KEY_PREFIX + id, data)
}

export function readLocalImport(id: string): LocalImportData | null {
  if (typeof window === "undefined") return null
  return memoryCache.get(id) ?? null
}

export async function ensureLocalImport(id: string): Promise<LocalImportData | null> {
  if (typeof window === "undefined") return null
  const cached = memoryCache.get(id)
  if (cached) return cached
  const stored = await idbGet<LocalImportData>(KEY_PREFIX + id)
  if (stored) {
    memoryCache.set(id, stored)
    return stored
  }
  return null
}

export function clearLocalImport(id: string) {
  if (typeof window === "undefined") return
  memoryCache.delete(id)
  idbDelete(KEY_PREFIX + id)
}
