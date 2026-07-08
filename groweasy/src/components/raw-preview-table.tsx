import { AlertTriangleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { RawImportRow, ValidationWarning } from "@/lib/types"

export function RawPreviewTable({ rows }: { rows: RawImportRow[] }) {
  const columns = Object.keys(rows[0]?.raw_data ?? {}).slice(0, 12)

  if (rows.length === 0) {
    return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No usable rows found.</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="max-h-[560px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Sheet</TableHead>
              <TableHead>Row</TableHead>
              {columns.map((column) => (
                <TableHead key={column} className="min-w-44">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.sheet_name}</TableCell>
                <TableCell>{row.row_index}</TableCell>
                {columns.map((column) => (
                  <TableCell key={column}>{String(row.raw_data[column] ?? "")}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function ValidationWarnings({ warnings }: { warnings: ValidationWarning[] }) {
  if (warnings.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {warnings.map((warning) => (
        <div key={`${warning.code}-${warning.message}`} className="flex items-start gap-3 rounded-lg border p-3">
          <AlertTriangleIcon className="mt-0.5 size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{warning.message}</p>
            <Badge variant="outline" className="mt-1">
              {warning.count}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
