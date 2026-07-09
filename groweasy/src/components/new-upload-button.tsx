"use client"

import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function NewUploadButton({ needsWarning }: { needsWarning: boolean }) {
  const router = useRouter()

  function startNewUpload() {
    if (
      needsWarning &&
      !window.confirm("You have not saved or exported this import yet. Start a new upload anyway?")
    ) {
      return
    }

    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("groweasy-")) {
        sessionStorage.removeItem(key)
      }
    }
    router.push("/upload")
  }

  return (
    <Button size="sm" onClick={startNewUpload}>
      <PlusIcon className="size-4" />
      New upload
    </Button>
  )
}
