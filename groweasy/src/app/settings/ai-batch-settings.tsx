"use client"

import { useEffect, useState } from "react"
import { EyeIcon, GaugeIcon, LoaderIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api-client"

type BatchSettings = {
  batchSize: number
  requestBatchSize: number
  detailedReviewEnabled: boolean
}

type BatchNumberSetting = "batchSize" | "requestBatchSize"

type BatchLimits = {
  batchSize: { min: number; max: number; default: number }
  requestBatchSize: { min: number; max: number; default: number }
}

type ActiveProfile = {
  source: "default" | "user"
  provider: string
  model: string
}

type BatchRecommendation = {
  batchSize: number
  requestBatchSize: number
  label: string
  note: string
}

type SettingsResponse = {
  data?: {
    settings: BatchSettings
    limits: BatchLimits
    activeProfile: ActiveProfile
    recommendation: BatchRecommendation
    groqReference: {
      free: { rpm: number; rpd: number; tpm: number; note: string }
      developer: { rpm: number; tpm: number; note: string }
    }
  }
}

export function AiBatchSettings() {
  const [settings, setSettings] = useState<BatchSettings>({ batchSize: 15, requestBatchSize: 15, detailedReviewEnabled: true })
  const [limits, setLimits] = useState<BatchLimits | null>(null)
  const [activeProfile, setActiveProfile] = useState<ActiveProfile | null>(null)
  const [recommendation, setRecommendation] = useState<BatchRecommendation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingReviewMode, setSavingReviewMode] = useState(false)

  useEffect(() => {
    function loadSettings() {
      setLoading(true)
      api("/settings/ai")
        .then((r) => r.json())
        .then((payload: SettingsResponse) => {
          if (payload.data?.settings) {
            setSettings(payload.data.settings)
          }
          if (payload.data?.limits) {
            setLimits(payload.data.limits)
          }
          if (payload.data?.activeProfile) {
            setActiveProfile(payload.data.activeProfile)
          }
          if (payload.data?.recommendation) {
            setRecommendation(payload.data.recommendation)
          }
        })
        .finally(() => setLoading(false))
    }

    loadSettings()
    window.addEventListener("ai-settings-changed", loadSettings)

    return () => window.removeEventListener("ai-settings-changed", loadSettings)
  }, [])

  const effectiveLimits = limits ?? {
    batchSize: { min: 5, max: 100, default: 15 },
    requestBatchSize: { min: 1, max: 30, default: 15 },
  }

  function updateSetting(key: BatchNumberSetting, value: number) {
    setSettings((current) => {
      const next = {
        ...current,
        [key]: clamp(value, effectiveLimits[key].min, effectiveLimits[key].max),
      }

      if (key === "batchSize" && next.requestBatchSize > next.batchSize) {
        next.requestBatchSize = next.batchSize
      }

      if (key === "requestBatchSize") {
        next.requestBatchSize = Math.min(next.requestBatchSize, next.batchSize)
      }

      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    const res = await api("/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchSize: settings.requestBatchSize,
        requestBatchSize: settings.requestBatchSize,
      }),
    })
    setSaving(false)

    if (res.ok) {
      const payload: SettingsResponse = await res.json()
      if (payload.data?.settings) {
        setSettings(payload.data.settings)
      }
      toast.success("AI batch settings saved")
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? "Failed to save AI batch settings")
    }
  }

  async function handleReviewModeChange(enabled: boolean) {
    setSettings((current) => ({ ...current, detailedReviewEnabled: enabled }))
    setSavingReviewMode(true)
    const res = await api("/settings/review-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detailedReviewEnabled: enabled }),
    })
    setSavingReviewMode(false)

    if (res.ok) {
      toast.success(enabled ? "Detailed review enabled" : "Compact CRM-only mode enabled")
      window.dispatchEvent(new Event("ai-settings-changed"))
    } else {
      setSettings((current) => ({ ...current, detailedReviewEnabled: !enabled }))
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? "Failed to save review mode")
    }
  }

  function applyRecommendation() {
    if (!recommendation) return

    setSettings((current) => ({
      ...current,
      batchSize: clamp(recommendation.requestBatchSize, effectiveLimits.batchSize.min, effectiveLimits.batchSize.max),
      requestBatchSize: clamp(
        recommendation.requestBatchSize,
        effectiveLimits.requestBatchSize.min,
        effectiveLimits.requestBatchSize.max,
      ),
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GaugeIcon className="size-4" />
          AI batch tuning
        </CardTitle>
        <CardDescription>
          {activeProfile
            ? `${activeProfile.source === "user" ? "User" : "Default"} model: ${activeProfile.model}`
            : "Tune rows per request for the active AI model."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <EyeIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Detailed review visuals</div>
                  <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                    {settings.detailedReviewEnabled
                      ? "Uses more AI tokens, but gives better reasoning with field-level change reasons."
                      : "Uses fewer AI tokens by returning only final CRM row data, without change reasons."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.detailedReviewEnabled}
                disabled={savingReviewMode}
                onClick={() => void handleReviewModeChange(!settings.detailedReviewEnabled)}
                className="relative h-7 w-12 shrink-0 rounded-full border border-input bg-muted transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-checked:border-primary aria-checked:bg-primary"
              >
                <span className="absolute top-1 left-1 size-5 rounded-full bg-background shadow-sm transition-transform aria-checked:translate-x-5" aria-checked={settings.detailedReviewEnabled} />
              </button>
            </div>
            {!settings.detailedReviewEnabled ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                Compact mode reduces response tokens by skipping AI change explanations. Good/Missing/Skipped still works.
              </div>
            ) : null}
            {activeProfile?.source !== "user" ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-sm font-medium">Default backend model is fixed</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Turn on “Use my API key” to tune rows per AI request for your selected model.
                </p>
              </div>
            ) : (
              <>
            {recommendation ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{recommendation.label} sweet spot</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {recommendation.requestBatchSize} rows per AI request. {recommendation.note}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={applyRecommendation}>
                  Apply
                </Button>
              </div>
            ) : null}
            <BatchControl
              label="Rows per AI request"
              value={settings.requestBatchSize}
              min={effectiveLimits.requestBatchSize.min}
              max={effectiveLimits.requestBatchSize.max}
              hint="Lower is safer for model TPM and JSON reliability."
              onChange={(value) => {
                updateSetting("requestBatchSize", value)
                updateSetting("batchSize", value)
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <span>
                {activeProfile?.source === "user"
                  ? "This tuning is for your selected user model."
                  : "This tuning is for the default backend model."}
              </span>
              <Button onClick={handleSave} disabled={saving}>
                <SaveIcon />
                {saving ? "Saving..." : "Save tuning"}
              </Button>
            </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BatchControl({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  hint: string
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <Input
          className="w-20 text-right"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <input
        className="h-2 w-full accent-primary"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{hint}</span>
        <span>{min}-{max}</span>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}
