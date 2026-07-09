"use client"

import { useId, useState } from "react"

import { Input } from "@/components/ui/input"
import type { CellValue } from "@/lib/types"
import { cn } from "@/lib/utils"

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
    <div className={cn("min-w-0 flex-1", changed && "bg-primary/10")}>
      <Input
        value={localValue}
        list={suggestions?.length ? listId : undefined}
        aria-invalid={invalid}
        className={cn(
          "h-7 w-full rounded-[5px] border-transparent bg-transparent px-2 text-sm shadow-none ring-0 transition-colors",
          "hover:border-border hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/40",
          invalid && "border-destructive/70 bg-destructive/8 text-foreground hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
          changed && !invalid && "border-primary/35 bg-primary/8",
        )}
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
