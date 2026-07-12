"use client"

import * as React from "react"

import { UploadDropzoneSkeleton } from "@/components/skeletons/page-skeletons"
import { UploadDropzone } from "@/components/upload-dropzone"
import { Card, CardContent } from "@/components/ui/card"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { loadTemplates } from "@/lib/page-data"
import { useCachedResource } from "@/hooks/use-cached-resource"

const CACHE_KEY = CLIENT_CACHE_KEYS.templatesList

export function UploadClient() {
  const { data: templates, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadTemplates,
  })

  if (loading && !templates) return <UploadDropzoneSkeleton />

  if (error && !templates) {
    return (
      <Card>
        <CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    )
  }

  return <UploadDropzone templates={templates ?? []} />
}
