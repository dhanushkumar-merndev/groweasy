import { AppShell } from "@/components/app-shell"
import { ApiKeyManager } from "./api-key-manager"

export default async function SettingsPage() {
  return (
    <AppShell title="Settings" description="Manage AI provider API keys.">
      <ApiKeyManager />
    </AppShell>
  )
}
