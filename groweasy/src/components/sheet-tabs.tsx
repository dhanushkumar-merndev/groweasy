import Link from "next/link"

import { Button } from "@/components/ui/button"
import type { ImportSheet } from "@/lib/types"

export function SheetTabs({
  sheets,
  basePath,
  activeSheet,
}: {
  sheets: ImportSheet[]
  basePath: string
  activeSheet?: string
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      <Button variant={!activeSheet ? "secondary" : "outline"} size="sm" render={<Link href={basePath} />}>
        All Sheets
      </Button>
      {sheets.map((sheet) => (
        <Button
          key={sheet.id}
          variant={activeSheet === sheet.sheet_name ? "secondary" : "outline"}
          size="sm"
          render={<Link href={`${basePath}?sheet=${encodeURIComponent(sheet.sheet_name)}`} />}
        >
          {sheet.sheet_name}
        </Button>
      ))}
    </div>
  )
}
