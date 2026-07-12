import { AppShell } from "@/components/app-shell"
import { AiBatchSettings } from "./ai-batch-settings"
import { ApiKeyManager } from "./api-key-manager"

export default async function SettingsPage() {
  return (
    <AppShell title="Settings" description="Manage Cloudflare row AI, Groq analytics, and optional user API keys." freshAuth>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <ApiKeyManager />
        <AiBatchSettings />
      </div>
    </AppShell>
  )
}
