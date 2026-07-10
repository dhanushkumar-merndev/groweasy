import { AppShell } from "@/components/app-shell"
import { AiBatchSettings } from "./ai-batch-settings"
import { ApiKeyManager } from "./api-key-manager"

export default async function SettingsPage() {
  return (
    <AppShell title="Settings" description="Manage AI provider keys and batch tuning.">
      <ApiKeyManager />
      <AiBatchSettings />
    </AppShell>
  )
}
