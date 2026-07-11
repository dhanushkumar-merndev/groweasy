"use client"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function DatePickerWithRange({
  className,
  value,
  onChange,
}: {
  className?: string
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(value)
  const [desktop, setDesktop] = useState(false)

  useEffect(() => {
    if (open) setPendingRange(value)
  }, [open, value])

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)")
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const displayText = useMemo(() => {
    if (!value?.from) return "Pick a date range"
    if (value.to && value.from.getTime() !== value.to.getTime()) {
      return `${format(value.from, "LLL dd, y")} – ${format(value.to, "LLL dd, y")}`
    }
    return format(value.from, "LLL dd, y")
  }, [value])

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("justify-start text-left font-normal", !value?.from && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 size-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-[20.5rem] p-2", desktop && "w-[41rem]")} align="start" sideOffset={8}>
          <Calendar
            className="p-1"
            mode="range"
            selected={pendingRange}
            onSelect={setPendingRange}
            numberOfMonths={desktop ? 2 : 1}
            defaultMonth={pendingRange?.from ?? value?.from ?? new Date()}
          />
          <div className="mt-2 flex items-center justify-end border-t pt-2">
            <Button
              size="sm"
              onClick={() => {
                onChange(pendingRange)
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
