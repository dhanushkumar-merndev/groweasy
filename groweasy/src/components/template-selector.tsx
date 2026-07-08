"use client"

import type { Template } from "@/lib/types"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function TemplateSelector({
  templates,
  value,
  onValueChange,
}: {
  templates: Template[]
  value?: string
  onValueChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => nextValue && onValueChange(nextValue)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a cleaning template" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
