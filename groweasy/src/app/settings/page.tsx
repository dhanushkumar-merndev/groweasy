import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isAuthConfigured } from "@/server/auth/auth"
import { isSupabaseConfigured } from "@/server/db/supabase"
import { isGoogleSheetsConfigured } from "@/server/google/sheets"

const settings = [
  ["Better Auth Google", isAuthConfigured()],
  ["Supabase service role", isSupabaseConfigured()],
  ["Redis / Upstash", Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)],
  ["Groq AI", Boolean(process.env.GROQ_API_KEY)],
  ["Google Sheets service account", isGoogleSheetsConfigured()],
] as const

export default function SettingsPage() {
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
