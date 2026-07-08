import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { serverFetch } from "@/lib/server-api"

type ConfigStatus = {
  auth: boolean
  supabase: boolean
  google_sheets: boolean
  redis: boolean
  groq: boolean
}

export default async function SettingsPage() {
  const config = await serverFetch<ConfigStatus>("/auth/config")

  const settings: [string, boolean][] = [
    ["Better Auth Google", config.auth],
    ["Supabase service role", config.supabase],
    ["Redis / Upstash", config.redis],
    ["Groq AI", config.groq],
    ["Google Sheets service account", config.google_sheets],
  ]

  return (
    <AppShell title="Settings" description="Server-side provider readiness and safe secret boundaries.">
      <Card>
        <CardHeader>
          <CardTitle>Provider configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {settings.map(([label, configured]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">{label}</span>
              <Badge variant={configured ? "default" : "secondary"}>{configured ? "Configured" : "Demo fallback"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  )
}
