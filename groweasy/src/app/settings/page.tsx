import { AppShell } from "@/components/app-shell"
import { AiBatchSettings } from "./ai-batch-settings"
import { ApiKeyManager } from "./api-key-manager"

export default async function SettingsPage() {
  return (
    <AppShell title="Settings" description="Manage Cloudflare row AI, Groq analytics, and optional user API keys." freshAuth>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:[&>*]:min-w-0">
        <ApiKeyManager />
        <AiBatchSettings />
      </div>
    </AppShell>
  )
}
