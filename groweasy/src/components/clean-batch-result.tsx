"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type CleanedValue = string | number | boolean | null | undefined
type CleanedData = Record<string, CleanedValue>

type AiChange = {
  field: string
  before: CleanedValue
  after: CleanedValue
  reason: string
}

type CleanBatchRow = {
  source_sheet: string
  source_sheet_index: number
  source_row_index: number
  status: "good" | "missing" | "skipped"
  missing_fields: string[]
  skip_reason?: string
  cleaned_data: CleanedData
  ai_changes: AiChange[]
}

export type CleanBatchResponse = {
  batch_id: string
  good_rows: CleanBatchRow[]
  missing_rows: CleanBatchRow[]
  skipped_rows: CleanBatchRow[]
  summary: {
    total_input_rows: number
    good_count: number
    missing_count: number
    skipped_count: number
    ai_changed_row_count: number
    ai_changed_cell_count: number
    missing_by_field: Record<string, number>
    skipped_by_reason: Record<string, number>
  }
  error?: {
    message: string
  }
}

export function CleanBatchResultView({ result }: { result: CleanBatchResponse }) {
  const rows = [...result.good_rows, ...result.missing_rows, ...result.skipped_rows].sort((left, right) => {
    if (left.source_sheet_index !== right.source_sheet_index) {
      return left.source_sheet_index - right.source_sheet_index
    }

    return left.source_row_index - right.source_row_index
  })
  const changes = rows.flatMap((row) =>
    row.ai_changes.map((change) => ({
      row,
      change,
    }))
  )
  const missingBreakdown = Object.entries(result.summary.missing_by_field)

  return (
    <div className="grid gap-6 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryMetric label="Batch" value={result.batch_id} />
        <SummaryMetric label="Good" value={result.summary.good_count} />
        <SummaryMetric label="Missing" value={result.summary.missing_count} />
        <SummaryMetric label="Skipped" value={result.summary.skipped_count} />
      </div>

      <ResultSection title="Rows">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S.No</TableHead>
              <TableHead>File Row</TableHead>
              <TableHead>Sheet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Missing Fields</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Country Code</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Project/Source</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.source_sheet_index}-${row.source_row_index}-${index}`}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{row.source_row_index}</TableCell>
                <TableCell>{displayValue(row.source_sheet)}</TableCell>
                <TableCell>{statusLabel(row.status)}</TableCell>
                <TableCell>{row.missing_fields.length > 0 ? row.missing_fields.join(", ") : "—"}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.created_at)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.name)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.email)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.country_code)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.mobile_without_country_code ?? row.cleaned_data.mobile)}</TableCell>
                <TableCell>
                  {displayValue(
                    row.cleaned_data.project_interested ?? row.cleaned_data.source ?? row.cleaned_data.data_source
                  )}
                </TableCell>
                <TableCell>{displayValue(row.cleaned_data.lead_owner ?? row.cleaned_data.owner)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.city)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.state)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.country)}</TableCell>
                <TableCell>{displayValue(row.cleaned_data.crm_note ?? row.cleaned_data.notes ?? row.cleaned_data.description)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResultSection>

      <ResultSection title="AI Changes">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S.No</TableHead>
              <TableHead>File Row</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Before</TableHead>
              <TableHead>After</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.length > 0 ? (
              changes.map(({ row, change }, index) => (
                <TableRow key={`${row.source_sheet_index}-${row.source_row_index}-${change.field}-${index}`}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{row.source_row_index}</TableCell>
                  <TableCell>{displayValue(change.field)}</TableCell>
                  <TableCell>{displayValue(change.before)}</TableCell>
                  <TableCell>{displayValue(change.after)}</TableCell>
                  <TableCell>{displayValue(change.reason)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>—</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ResultSection>

      <ResultSection title="Summary">
        <Table>
          <TableBody>
            <SummaryRow label="Total Input Rows" value={result.summary.total_input_rows} />
            <SummaryRow label="Good Rows" value={result.summary.good_count} />
            <SummaryRow label="Missing Rows" value={result.summary.missing_count} />
            <SummaryRow label="Skipped Rows" value={result.summary.skipped_count} />
            <SummaryRow label="AI Changed Rows" value={result.summary.ai_changed_row_count} />
            <SummaryRow label="AI Changed Cells" value={result.summary.ai_changed_cell_count} />
          </TableBody>
        </Table>
      </ResultSection>

      <ResultSection title="Missing Field Breakdown">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missingBreakdown.length > 0 ? (
              missingBreakdown.map(([field, count]) => (
                <TableRow key={field}>
                  <TableCell>{field}</TableCell>
                  <TableCell>{count}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2}>—</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ResultSection>
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function SummaryMetric({ label, value }: { label: string; value: CleanedValue }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{displayValue(value)}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: CleanedValue }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell>{displayValue(value)}</TableCell>
    </TableRow>
  )
}

function displayValue(value: CleanedValue) {
  if (value === null || value === undefined || String(value) === "") {
    return "—"
  }

  return String(value)
}

function statusLabel(status: CleanBatchRow["status"]) {
  switch (status) {
    case "good":
      return "✅ Good"
    case "missing":
      return "⚠️ Missing"
    case "skipped":
      return "⏭️ Skipped"
  }
}
