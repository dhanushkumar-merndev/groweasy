"use client"

import { useEffect, useState } from "react"
import { LoaderIcon, SaveIcon, TrashIcon } from "lucide-react"
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api("/settings/apikey")
      .then((r) => r.json())
      .then((data) => {
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
    } else {
      toast.error("Failed to remove API key")
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
          <div className="grid gap-3">
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
            <div className="grid gap-2">
              <Label>API key</Label>
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={hasExisting ? "New key (leave blank to keep current)" : "sk-..."}
              />
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
