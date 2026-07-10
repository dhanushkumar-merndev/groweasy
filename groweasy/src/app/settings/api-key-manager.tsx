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
  groq: {
    label: "Groq",
    models: [
      { value: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
      { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast)" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { value: "gemma2-9b-it", label: "Gemma 2 9B" },
      { value: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" },
    ],
  },
  openai: {
    label: "OpenAI",
    models: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
  },
  anthropic: {
    label: "Anthropic",
    models: [
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ],
  },
  google: {
    label: "Google",
    models: [
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
  },
  together: {
    label: "Together AI",
    models: [
      { value: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B" },
      { value: "mistralai/Mixtral-8x22B-Instruct-v0.1", label: "Mixtral 8x22B" },
      { value: "deepseek-ai/deepseek-llm-67b-chat", label: "DeepSeek 67B" },
    ],
  },
}

export function ApiKeyManager() {
  const [provider, setProvider] = useState("groq")
  const [model, setModel] = useState("openai/gpt-oss-120b")
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
          const p = data.data.provider ?? "groq"
          const m = data.data.model ?? "openai/gpt-oss-120b"
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
    if (!key.trim() && !savedInfo) return
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
                    Use my API key for AI processing
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Off uses the default backend API keys.
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
                <Label>Provider</Label>
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
                <Label>Model</Label>
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
                <Label>API key</Label>
                <Input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={hasExisting ? "New key (leave blank to keep current)" : "gsk_..."}
                />
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
                  ? "Custom key is active for the next AI run."
                  : "Add and save a key before the next AI run."
                : "Default backend keys are active."}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
