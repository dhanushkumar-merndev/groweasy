"use client"

import { useEffect, useState } from "react"
import { KeyRoundIcon, LoaderIcon, SaveIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api-client"

const PROVIDER_MODELS: Record<string, { label: string; models: { value: string; label: string }[] }> = {
  cloudflare: {
    label: "Workers AI",
    models: [
      { value: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },
    ],
  },
  groq: {
    label: "Groq",
    models: [
      { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
      { value: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    ],
  },
}

const DELETE_CONFIRMATION_TEXT = "DELETE MY API"

type ApiKeyResponse = {
  hasKey?: boolean
  maskedKey?: string
  provider?: string
  model?: string
  useUserApiKey?: boolean
}

function normalizeProvider(provider: unknown) {
  const normalized = String(provider ?? "").toLowerCase().replace(/[\s_-]/g, "")
  if (normalized === "cloudflare" || normalized === "workersai") return "cloudflare"
  return normalized === "groq" ? "groq" : "cloudflare"
}

function getSupportedModel(provider: string, model: unknown) {
  const models = PROVIDER_MODELS[provider]?.models ?? PROVIDER_MODELS.cloudflare.models
  const value = String(model ?? "")

  return models.some((item) => item.value === value) ? value : models[0]?.value ?? ""
}

export function ApiKeyManager() {
  const [provider, setProvider] = useState("cloudflare")
  const [model, setModel] = useState("@cf/google/gemma-4-26b-a4b-it")
  const [key, setKey] = useState("")
  const [savedInfo, setSavedInfo] = useState<{ provider: string; model: string } | null>(null)
  const [useUserApiKey, setUseUserApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeConfirmation, setRemoveConfirmation] = useState("")

  async function loadApiKeySettings() {
    const data: ApiKeyResponse = await api("/settings/apikey")
      .then((r) => r.json())

    setUseUserApiKey(Boolean(data.useUserApiKey))
    if (data.hasKey) {
      const p = normalizeProvider(data.provider)
      const m = getSupportedModel(p, data.model)
      setSavedInfo({ provider: p, model: m })
      setProvider(p)
      setModel(m)
    } else {
      setSavedInfo(null)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadApiKeySettings()
        .catch(() => {
          toast.error("Unable to load API key settings")
        })
        .finally(() => setLoading(false))
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  function refreshSettingsPanels() {
    window.dispatchEvent(new Event("ai-settings-changed"))
  }

  async function refreshAfterChange() {
    await loadApiKeySettings()
    refreshSettingsPanels()
  }

  const models = PROVIDER_MODELS[provider]?.models ?? []

  function handleProviderChange(value: string | null) {
    if (!value) return
    setProvider(value)
    setModel(PROVIDER_MODELS[value]?.models[0]?.value ?? "")
  }

  async function handleSave() {
    if (!key.trim() && !savedInfo) {
      toast.error("API key is mandatory.")
      return
    }
    if (provider === "cloudflare" && key.trim() && !isValidCloudflareKeyInput(key)) {
      toast.error("Cloudflare key must be saved as accountId:api-token.")
      return
    }
    setSaving(true)
    const res = await api("/settings/apikey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, key }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("API key saved")
      setKey("")
      await refreshAfterChange()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? "Failed to save API key")
    }
  }

  async function handleRemove() {
    if (removeConfirmation !== DELETE_CONFIRMATION_TEXT) return

    setRemoving(true)
    const res = await api("/settings/apikey", { method: "DELETE" })
    setRemoving(false)

    if (res.ok) {
      toast.success("API key removed")
      setRemoveDialogOpen(false)
      setRemoveConfirmation("")
      await refreshAfterChange()
    } else {
      toast.error("Failed to remove API key")
    }
  }

  async function handleModeChange(checked: boolean) {
    setUseUserApiKey(checked)
    const res = await api("/settings/apikey/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useUserApiKey: checked }),
    })

    if (res.ok) {
      toast.success(checked ? "Using your API key" : "Using default API keys")
      await refreshAfterChange()
    } else {
      setUseUserApiKey(!checked)
      toast.error("Failed to update API key mode")
    }
  }

  const hasExisting = !!savedInfo

  return (
    <>
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <CardTitle className="text-base">Your AI provider</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Controls row processing, analytics, and upload limits.</p>
        </div>
        {!loading ? (
          <Badge variant={useUserApiKey && hasExisting ? "default" : "secondary"}>
            {useUserApiKey && hasExisting ? "Custom key active" : "Default keys"}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/15 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
                  <KeyRoundIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="use-user-api-key" className="text-sm font-medium">
                    Use my API key for AI processing and analytics
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Turn off to disable your saved key without deleting it.
                  </p>
                </div>
              </div>
              <button
                id="use-user-api-key"
                type="button"
                role="switch"
                aria-checked={useUserApiKey}
                onClick={() => void handleModeChange(!useUserApiKey)}
                className="relative h-7 w-12 shrink-0 rounded-full border border-input bg-muted transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary"
              >
                <span className="absolute top-1 left-1 size-5 rounded-full bg-background shadow-sm transition-transform aria-checked:translate-x-5" aria-checked={useUserApiKey} />
              </button>
            </div>

            <fieldset disabled={!useUserApiKey} className="grid gap-3 disabled:opacity-45">
              <div className="rounded-md border">
                <div className="grid border-b md:grid-cols-3">
                  <SettingSummary label="Status" value={hasExisting ? "Saved" : "No key"} />
                  <SettingSummary label="Provider" value={PROVIDER_MODELS[provider]?.label ?? provider} />
                  <SettingSummary label="Model" value={models.find((item) => item.value === model)?.label ?? model} />
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-[160px_minmax(220px,260px)_minmax(260px,1fr)]">
                  <div className="grid gap-2">
                    <RequiredLabel>Provider</RequiredLabel>
                    <Select value={provider} onValueChange={handleProviderChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROVIDER_MODELS).map(([value, p]) => (
                          <SelectItem key={value} value={value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <RequiredLabel>Model</RequiredLabel>
                    <Select value={model} onValueChange={(v) => v && setModel(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <RequiredLabel>API key</RequiredLabel>
                    <Input
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder={hasExisting ? "New key (leave blank to keep current)" : provider === "cloudflare" ? "accountId:cloudflare-api-token" : "gsk_..."}
                      required={useUserApiKey && !hasExisting}
                    />
                    <p className="text-xs text-muted-foreground">
                      {provider === "cloudflare"
                        ? "Use accountId:api-token."
                        : "Required for your own Groq processing."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {hasExisting ? "Leave the key field blank to keep the current saved key." : "Save a key before processing larger uploads."}
                </p>
                <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={saving || (!key.trim() && !hasExisting)}>
                  <SaveIcon />
                  {saving ? "Saving..." : hasExisting ? "Update" : "Save key"}
                </Button>
                {hasExisting && (
                  <Button variant="destructive" onClick={() => setRemoveDialogOpen(true)}>
                    <TrashIcon />
                    Remove
                  </Button>
                )}
                </div>
              </div>
            </fieldset>
            <div className="rounded-md border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
              {useUserApiKey
                ? hasExisting
                  ? "Custom key is active for AI processing and analytics."
                  : "Add and save a key before the next AI run or analytics generate."
                : "Default backend keys are active: Cloudflare for row processing, Groq for analytics."}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog
      open={removeDialogOpen}
      onOpenChange={(open) => {
        setRemoveDialogOpen(open)
        if (!open) setRemoveConfirmation("")
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove API key</DialogTitle>
          <DialogDescription>
            This removes the saved API key from the database. Use the toggle if you only want to disable it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="remove-api-key-confirmation" className="select-text">
            Type <span className="select-text font-semibold text-foreground">{DELETE_CONFIRMATION_TEXT}</span> to confirm.
          </Label>
          <Input
            id="remove-api-key-confirmation"
            value={removeConfirmation}
            onChange={(event) => setRemoveConfirmation(event.target.value)}
            autoComplete="off"
            placeholder={DELETE_CONFIRMATION_TEXT}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRemoveDialogOpen(false)}
            disabled={removing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleRemove()}
            disabled={removing || removeConfirmation !== DELETE_CONFIRMATION_TEXT}
          >
            <TrashIcon />
            {removing ? "Removing..." : "Remove API key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function SettingSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label>
      {children}
      <span className="ml-1 text-destructive">*</span>
    </Label>
  )
}

function isValidCloudflareKeyInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { accountId?: string; account_id?: string; token?: string; key?: string }
      return Boolean((parsed.accountId || parsed.account_id)?.trim() && (parsed.token || parsed.key)?.trim())
    } catch {
      return false
    }
  }

  const separatorIndex = trimmed.indexOf(":")
  return separatorIndex > 0 && separatorIndex < trimmed.length - 1
}
