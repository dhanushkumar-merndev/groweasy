"use client"

import { useEffect, useState } from "react"
import { KeyRoundIcon, LoaderIcon, SaveIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

  useEffect(() => {
    api("/settings/apikey")
      .then((r) => r.json())
      .then((data) => {
        setUseUserApiKey(Boolean(data.data?.useUserApiKey))
        if (data.data?.hasKey) {
          const p = normalizeProvider(data.data.provider)
          const m = getSupportedModel(p, data.data.model)
          setSavedInfo({ provider: p, model: m })
          setProvider(p)
          setModel(m)
        }
      })
      .finally(() => setLoading(false))
  }, [])

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
      setSavedInfo({ provider, model })
      setKey("")
      window.dispatchEvent(new Event("ai-settings-changed"))
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? "Failed to save API key")
    }
  }

  async function handleRemove() {
    const res = await api("/settings/apikey", { method: "DELETE" })
    if (res.ok) {
      toast.success("API key removed")
      setSavedInfo(null)
      setUseUserApiKey(false)
      window.dispatchEvent(new Event("ai-settings-changed"))
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
      window.dispatchEvent(new Event("ai-settings-changed"))
    } else {
      setUseUserApiKey(!checked)
      toast.error("Failed to update API key mode")
    }
  }

  const hasExisting = !!savedInfo

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your AI provider</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <KeyRoundIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="use-user-api-key" className="text-sm font-medium">
                    Use my API key for AI processing and analytics
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Off uses Cloudflare for row processing and Groq for analytics.
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_260px_minmax(280px,1fr)]">
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
              <div className="grid gap-2 md:col-span-2 xl:col-span-1">
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
                    ? "Mandatory format: accountId:api-token."
                    : "Mandatory when using your own Groq key."}
                </p>
              </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving || (!key.trim() && !hasExisting)}>
                  <SaveIcon />
                  {saving ? "Saving..." : hasExisting ? "Update" : "Save key"}
                </Button>
                {hasExisting && (
                  <Button size="sm" variant="destructive" onClick={handleRemove}>
                    <TrashIcon />
                    Remove
                  </Button>
                )}
              </div>
            </fieldset>
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
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
