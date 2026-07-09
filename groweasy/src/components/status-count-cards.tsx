import { BadgeCheckIcon, FileWarningIcon, SparklesIcon, XCircleIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ImportSummary } from "@/lib/types"

const cards = [
  { key: "good_count", label: "Good", icon: BadgeCheckIcon },
  { key: "missing_count", label: "Missing", icon: FileWarningIcon },
  { key: "skipped_count", label: "Skipped", icon: XCircleIcon },
  { key: "ai_changed_count", label: "AI changed", icon: SparklesIcon },
] as const

export function StatusCountCards({ summary }: { summary: Pick<ImportSummary, (typeof cards)[number]["key"]> }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
      {cards.map((card) => {
        const Icon = card.icon

        return (
          <Card key={card.key} className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="min-w-0 truncate text-sm font-medium">{card.label}</CardTitle>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{summary[card.key]}</div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
