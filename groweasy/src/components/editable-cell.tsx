"use client"

import { useId, useState } from "react"

import { Input } from "@/components/ui/input"
import type { CellValue } from "@/lib/types"

export function EditableCell({
  value,
  suggestions,
  invalid = false,
  changed = false,
  onChange,
}: {
  value: CellValue
  suggestions?: string[]
  invalid?: boolean
  changed?: boolean
  onChange?: (value: string) => void
}) {
  const listId = useId()
  const [localValue, setLocalValue] = useState(value === null || value === undefined ? "" : String(value))

  return (
    <div className={changed ? "rounded-md bg-[color-mix(in_oklch,var(--primary),transparent_88%)] p-1" : undefined}>
      <Input
        value={localValue}
        list={suggestions?.length ? listId : undefined}
        aria-invalid={invalid}
        className={invalid ? "border-destructive focus-visible:ring-destructive/30" : undefined}
        onChange={(event) => {
          setLocalValue(event.target.value)
          onChange?.(event.target.value)
        }}
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </div>
  )
}
