import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function HistoryPage() {
  const user = await requireCurrentUser()
  const history = store.listHistory(user.id)

  return (
    <AppShell title="History" description="Permanent count-based events for uploads, saves, row changes, and exports.">
      <div className="grid gap-3">
        {history.map((entry) => (
          <Card key={entry.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>{entry.action.replace(/_/g, " ")}</span>
                <Badge variant="outline">{new Date(entry.created_at).toLocaleString()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(entry.meta, null, 2)}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
