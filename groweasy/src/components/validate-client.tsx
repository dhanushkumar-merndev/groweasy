"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  Loader2Icon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ImportSheet, RawImportRow, ValidationWarning } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { normalizeLocalValidationRows, saveLocalValidationPreview } from "@/lib/local-validation-preview"

const viewportCenterClass = "lg:-translate-x-[118px]"

function StepRow({
  label, detail, state,
}: { label: string; detail: string; state: "waiting" | "active" | "done" }) {
  return (
    <div className={cn(
      "flex transform-gpu items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-500 ease-out",
      "animate-in fade-in slide-in-from-bottom-2 zoom-in-95",
      state === "waiting" && "border-border/40 opacity-40",
      state === "active"  && "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10",
      state === "done"    && "border-primary/20 bg-primary/5",
    )}>
      <div className={cn(
        "flex size-7 items-center justify-center rounded-full shrink-0 transition-all duration-300",
        state === "active"  && "bg-primary/15",
        state === "done"    && "bg-primary/10",
        state === "waiting" && "bg-muted/30",
      )}>
        {state === "done"   ? <CheckCircle2Icon className="size-4 text-primary" /> :
         state === "active" ? <Loader2Icon className="size-4 text-primary animate-spin" /> :
                              <div className="size-2 rounded-full bg-muted-foreground/40" />}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

/* ─── Main component ───────────────────────────────────────────────── */
interface ValidateClientProps {
  importId: string
  rows: RawImportRow[]
  warnings: ValidationWarning[]
  sheets: ImportSheet[]
  basePath: string
  removeBlankRows?: boolean
  dashValuesBlank?: boolean
}

export function ValidateClient({
  importId,
  rows,
  basePath,
  removeBlankRows: initialRemoveBlankRows = true,
  dashValuesBlank: initialDashValuesBlank = true,
}: ValidateClientProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<"setup" | "cleaning" | "done">("setup")
  const [questionStep, setQuestionStep] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)
  const [removeBlankRows, setRemoveBlankRows] = useState<boolean | null>(null)
  const [dashValuesBlank, setDashValuesBlank] = useState<boolean | null>(null)
  const [requireBothEmailPhone, setRequireBothEmailPhone] = useState<boolean | null>(null)

  const resolvedRemoveBlankRows = removeBlankRows ?? initialRemoveBlankRows
  const resolvedDashValuesBlank = dashValuesBlank ?? initialDashValuesBlank
  const resolvedRequireBothEmailPhone = requireBothEmailPhone ?? false

  const localSteps = useMemo(() => {
    return [
      { id: "read", label: "Reading raw rows", detail: "Scanning all imported cells" },
      {
        id: "blank",
        label: resolvedRemoveBlankRows ? "Removing rows with blanks" : "Keeping rows with blanks",
        detail: resolvedRemoveBlankRows
          ? "Filtering any row where one or more cells are empty"
          : "Rows with blank cells will stay in the preview",
      },
      {
        id: "dash",
        label: resolvedDashValuesBlank ? "Normalizing dash values" : "Keeping dash values",
        detail: resolvedDashValuesBlank
          ? 'Converting "-" and "--" to empty values'
          : 'Dash values will stay as-is in the preview',
      },
      { id: "verify", label: "Verifying data integrity", detail: "Checking row counts and column alignment" },
    ]
  }, [resolvedDashValuesBlank, resolvedRemoveBlankRows])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedState = readValidateSession(importId)

      if (!savedState) {
        return
      }

      if (savedState.phase === "done") {
        setRemoveBlankRows(savedState.removeBlankRows)
        setDashValuesBlank(savedState.dashValuesBlank)
        setRequireBothEmailPhone(savedState.requireBothEmailPhone ?? false)
        setQuestionStep(savedState.questionStep)
        setPhase("done")
        return
      }

      setRemoveBlankRows(savedState.removeBlankRows)
      setDashValuesBlank(savedState.dashValuesBlank)
      setRequireBothEmailPhone(savedState.requireBothEmailPhone ?? null)
      setQuestionStep(savedState.questionStep)
      setPhase(savedState.phase)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [basePath, importId, router])

  useEffect(() => {
    if (phase !== "cleaning") return

    let cancelled = false

    async function run() {
      setStepIdx(0)
      await delay(450)
      if (cancelled) return

      setStepIdx(1)
      await delay(550)
      if (cancelled) return

      const normalizedRows = normalizeLocalValidationRows(importId, rows).map((row) => ({
        ...row,
        raw_data: resolvedDashValuesBlank ? normalizeDashValues(row.raw_data ?? {}) : row.raw_data,
      }))

      const finalRows = resolvedRemoveBlankRows
        ? normalizedRows.filter((row) =>
            Object.values(row.raw_data ?? {}).some((value) => String(value ?? "").trim() !== "")
          )
        : normalizedRows

      saveLocalValidationPreview({
        importId,
        rows: finalRows,
        blankRowsRemoved: resolvedRemoveBlankRows ? rows.length - finalRows.length : 0,
        removeBlankRows: resolvedRemoveBlankRows,
        dashValuesBlank: resolvedDashValuesBlank,
        requireBothEmailPhone: resolvedRequireBothEmailPhone,
      })

      setStepIdx(2)
      await delay(550)
      if (cancelled) return

      setStepIdx(3)
      await delay(450)
      if (cancelled) return

      setStepIdx(4)
      await delay(260)
      if (cancelled) return

      saveValidateSession(importId, {
        phase: "done",
        questionStep: 2,
        removeBlankRows: resolvedRemoveBlankRows,
        dashValuesBlank: resolvedDashValuesBlank,
        requireBothEmailPhone: resolvedRequireBothEmailPhone,
      })
      router.push(basePath.replace(/\/validate$/, "/preview"))
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [basePath, importId, phase, resolvedDashValuesBlank, resolvedRemoveBlankRows, resolvedRequireBothEmailPhone, router, rows])

  const setupQuestions = [
    {
      key: "blank",
      label: "Remove rows with blank cells",
      detail: "Delete the whole row if any cell is empty",
      value: removeBlankRows,
      onAnswer: (nextValue: boolean) => {
        saveValidateSession(importId, {
          phase: "setup",
          questionStep: 1,
          removeBlankRows: nextValue,
          dashValuesBlank,
          requireBothEmailPhone,
        })
        setRemoveBlankRows(nextValue)
        setQuestionStep(1)
      },
    },
    {
      key: "dash",
      label: "Treat dash (-) values as blank",
      detail: 'Convert "-" or "--" cells to empty string',
      value: dashValuesBlank,
      onAnswer: (nextValue: boolean) => {
        saveValidateSession(importId, {
          phase: "setup",
          questionStep: 2,
          removeBlankRows: removeBlankRows ?? initialRemoveBlankRows,
          dashValuesBlank: nextValue,
          requireBothEmailPhone,
        })
        setDashValuesBlank(nextValue)
        setQuestionStep(2)
      },
    },
    {
      key: "contact",
      label: "Require both email and phone",
      detail: "Yes needs both fields. No accepts either email or phone.",
      value: requireBothEmailPhone,
      onAnswer: (nextValue: boolean) => {
        saveValidateSession(importId, {
          phase: "cleaning",
          questionStep: 2,
          removeBlankRows: removeBlankRows ?? initialRemoveBlankRows,
          dashValuesBlank: dashValuesBlank ?? initialDashValuesBlank,
          requireBothEmailPhone: nextValue,
        })
        setRequireBothEmailPhone(nextValue)
        setPhase("cleaning")
      },
    },
  ] as const

  const activeQuestion = setupQuestions[questionStep]
  const visibleQuestions = setupQuestions.slice(0, questionStep + 1)

  if (phase === "setup") {
    return (
      <div
        className={cn(
          "grid min-h-[58vh] content-center justify-items-center gap-3 animate-in fade-in duration-500 transition-transform ease-out",
          viewportCenterClass,
          questionStep > 0 && "-translate-y-2",
        )}
      >
        <div className="w-full max-w-xl space-y-2">
          {visibleQuestions.map((question, index) => (
            <QuestionOption
              key={question.key}
              checked={question.value}
              onCheckedChange={index === questionStep ? (value) => activeQuestion.onAnswer(Boolean(value)) : undefined}
              label={question.label}
              detail={question.detail}
              disabled={index < questionStep}
            />
          ))}
        </div>
      </div>
    )
  }

  if (phase === "cleaning") {
    return (
      <div className={cn("grid min-h-[58vh] content-center justify-items-center gap-2 animate-in fade-in duration-500 ease-out -translate-y-2", viewportCenterClass)}>
        <div className="w-full max-w-xl space-y-2">
          {setupQuestions.map((question) => (
            <QuestionOption
              key={question.key}
              checked={question.value}
              label={question.label}
              detail={question.detail}
              disabled
            />
          ))}
        </div>
        <div className="grid w-full max-w-xl gap-2 animate-in fade-in duration-500">
          {localSteps.slice(0, stepIdx + 1).map((step, index) => (
            <StepRow
              key={step.id}
              label={step.label}
              detail={step.detail}
              state={index < stepIdx ? "done" : "active"}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("grid min-h-[58vh] content-center justify-items-center gap-2 animate-in fade-in duration-500 ease-out -translate-y-2", viewportCenterClass)}>
      <div className="w-full max-w-xl space-y-2">
        {setupQuestions.map((question) => (
          <QuestionOption
            key={question.key}
            checked={question.value}
            label={question.label}
            detail={question.detail}
            disabled
          />
        ))}
      </div>
      <div className="grid w-full max-w-xl gap-2 animate-in fade-in duration-500">
        {localSteps.map((step) => (
          <StepRow
            key={step.id}
            label={step.label}
            detail={step.detail}
            state="done"
          />
        ))}
      </div>
    </div>
  )
}

function QuestionOption({
  checked,
  onCheckedChange,
  label,
  detail,
  disabled = false,
}: {
  checked: boolean | null
  onCheckedChange?: (checked: boolean) => void
  label: string
  detail: string
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/40 bg-card/40 px-4 py-3 transition-all duration-500 ease-out animate-in fade-in sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0 text-left">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <div
        className={cn(
          "flex w-fit overflow-hidden rounded-lg border border-border/50 bg-muted/20 p-0.5 sm:justify-self-end",
          disabled && "pointer-events-none opacity-90",
        )}
      >
        <Button
          type="button"
          variant={checked === true ? "default" : "ghost"}
          size="sm"
          onClick={() => onCheckedChange?.(true)}
          className={cn(
            "h-6 min-w-10 rounded-md px-2.5 text-xs",
            checked !== true && "text-muted-foreground",
          )}
          disabled={disabled}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant={checked === false ? "default" : "ghost"}
          size="sm"
          onClick={() => onCheckedChange?.(false)}
          className={cn(
            "h-6 min-w-10 rounded-md px-2.5 text-xs",
            checked !== false && "text-muted-foreground",
          )}
          disabled={disabled}
        >
          No
        </Button>
      </div>
    </div>
  )
}

function normalizeDashValues(rowData: RawImportRow["raw_data"]) {
  return Object.fromEntries(
    Object.entries(rowData).map(([key, value]) => {
      const stringValue = String(value ?? "").trim()
      return [key, stringValue === "-" || stringValue === "--" ? "" : value]
    })
  )
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

type ValidateSessionState = {
  phase: "setup" | "cleaning" | "done"
  questionStep: number
  removeBlankRows: boolean | null
  dashValuesBlank: boolean | null
  requireBothEmailPhone?: boolean | null
}

function validateSessionKey(importId: string) {
  return `groweasy-validate-state:${importId}`
}

function saveValidateSession(importId: string, state: ValidateSessionState) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem(validateSessionKey(importId), JSON.stringify(state))
}

function readValidateSession(importId: string) {
  if (typeof window === "undefined") {
    return null
  }

  const rawState = window.sessionStorage.getItem(validateSessionKey(importId))

  if (!rawState) {
    return null
  }

  try {
    const state = JSON.parse(rawState) as ValidateSessionState

    return state.phase === "setup" || state.phase === "cleaning" || state.phase === "done" ? state : null
  } catch {
    window.sessionStorage.removeItem(validateSessionKey(importId))
    return null
  }
}
