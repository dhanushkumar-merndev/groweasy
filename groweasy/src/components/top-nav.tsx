import { Badge } from "@/components/ui/badge"

export function TopNav({ isDemo }: { isDemo: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">AI Excel Cleaner & Analytics Platform</p>
        <h2 className="text-2xl font-semibold tracking-normal">Clean, save, export, and analyze spreadsheet data.</h2>
      </div>
      <Badge variant={isDemo ? "secondary" : "default"}>
        {isDemo ? "Demo-safe mode" : "Production auth"}
      </Badge>
    </div>
  )
}
