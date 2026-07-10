"use client"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  Loader2Icon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ImportSheet, RawImportRow, ValidationWarning } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { normalizeLocalValidationRows, saveLocalValidationPreview } from "@/lib/local-validation-preview"

function StepRow({
  label, detail, state,
}: { label: string; detail: ReactNode; state: "waiting" | "active" | "done" }) {
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
        <div className="mt-0.5 text-xs text-muted-foreground">{renderDetailWithTokenWarning(detail)}</div>
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
  templateName?: string
}

export function ValidateClient({
  importId,
  rows,
  basePath,
  removeBlankRows: initialRemoveBlankRows = true,
  dashValuesBlank: initialDashValuesBlank = true,
  templateName,
}: ValidateClientProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<"setup" | "cleaning" | "done">("setup")
  const [questionStep, setQuestionStep] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)
  const [removeBlankRows, setRemoveBlankRows] = useState<boolean | null>(null)
  const [dashValuesBlank, setDashValuesBlank] = useState<boolean | null>(null)
  const [correctSpelling, setCorrectSpelling] = useState<boolean | null>(null)
  const [requireBothEmailPhone, setRequireBothEmailPhone] = useState<boolean | null>(null)
  const [generateDescription, setGenerateDescription] = useState<boolean | null>(null)
  const resolvedRemoveBlankRows = removeBlankRows ?? initialRemoveBlankRows
  const resolvedDashValuesBlank = dashValuesBlank ?? initialDashValuesBlank
  const resolvedCorrectSpelling = correctSpelling ?? false
  const resolvedRequireBothEmailPhone = requireBothEmailPhone ?? false
  const resolvedGenerateDescription = generateDescription ?? (templateName === "Grow Easy CRM")

  const localSteps = useMemo(() => {
    return [
      { id: "read", label: "Reading raw rows", detail: "Scanning all imported cells" },
      {
        id: "blank",
        label: resolvedRemoveBlankRows ? "Removing empty source rows" : "Keeping empty source rows",
        detail: resolvedRemoveBlankRows
          ? "Filtering rows where every source cell is blank"
          : "Completely empty rows will stay in the preview",
      },
      {
        id: "dash",
        label: resolvedDashValuesBlank ? "Normalizing dash values" : "Keeping dash values",
        detail: resolvedDashValuesBlank
          ? 'Converting "-", "--", "#", "###", and placeholder values to blank'
          : "Placeholder values will stay as-is in the preview",
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
        setCorrectSpelling(savedState.correctSpelling ?? false)
        setRequireBothEmailPhone(savedState.requireBothEmailPhone ?? false)
        setGenerateDescription(savedState.generateDescription ?? false)
        setQuestionStep(savedState.questionStep)
        setPhase("done")
        return
      }

      setRemoveBlankRows(savedState.removeBlankRows)
      setDashValuesBlank(savedState.dashValuesBlank)
      setCorrectSpelling(savedState.correctSpelling ?? null)
      setRequireBothEmailPhone(savedState.requireBothEmailPhone ?? null)
      setGenerateDescription(savedState.generateDescription ?? null)
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
        correctSpelling: resolvedCorrectSpelling,
        requireBothEmailPhone: resolvedRequireBothEmailPhone,
        generateDescription: resolvedGenerateDescription,
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
        questionStep: templateName === "Grow Easy CRM" ? 4 : 3,
        removeBlankRows: resolvedRemoveBlankRows,
        dashValuesBlank: resolvedDashValuesBlank,
        correctSpelling: resolvedCorrectSpelling,
        requireBothEmailPhone: resolvedRequireBothEmailPhone,
        generateDescription: resolvedGenerateDescription,
      })
      router.push(basePath.replace(/\/validate$/, "/preview"))
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [basePath, importId, phase, resolvedDashValuesBlank, resolvedRemoveBlankRows, resolvedCorrectSpelling, resolvedRequireBothEmailPhone, resolvedGenerateDescription, router, rows, templateName])

  const setupQuestions = useMemo(() => {
    const questions: {
      key: string; label: string; detail: ReactNode; value: boolean | null;
      onAnswer: (nextValue: boolean) => void;
    }[] = [
      {
        key: "blank",
        label: "Remove empty source rows",
        detail: "Before AI, remove rows where every source cell is blank.",
        value: removeBlankRows,
        onAnswer: (nextValue: boolean) => {
          saveValidateSession(importId, {
            phase: "setup",
            questionStep: 1,
            removeBlankRows: nextValue,
            dashValuesBlank,
            correctSpelling,
            requireBothEmailPhone,
          })
          setRemoveBlankRows(nextValue)
          setQuestionStep(1)
        },
      },
      {
        key: "dash",
        label: "Treat garbage values as blank",
        detail: 'Convert "-", "--", "#", "##", "###", "test", "sample", and similar placeholders to empty.',
        value: dashValuesBlank,
        onAnswer: (nextValue: boolean) => {
          saveValidateSession(importId, {
            phase: "setup",
            questionStep: 2,
            removeBlankRows: removeBlankRows ?? initialRemoveBlankRows,
            dashValuesBlank: nextValue,
            correctSpelling,
            requireBothEmailPhone,
            generateDescription,
          })
          setDashValuesBlank(nextValue)
          setQuestionStep(2)
        },
      },
    ]

    const spellingQuestionIndex = questions.length
    questions.push({
      key: "spelling",
      label: "Correct spelling with AI",
      detail: "Fix clear spelling mistakes in text fields from your selected template. Shows yellow review highlights and uses more AI output tokens.",
      value: correctSpelling,
      onAnswer: (nextValue: boolean) => {
        saveValidateSession(importId, {
          phase: "setup",
          questionStep: spellingQuestionIndex + 1,
          removeBlankRows: removeBlankRows ?? initialRemoveBlankRows,
          dashValuesBlank: dashValuesBlank ?? initialDashValuesBlank,
          correctSpelling: nextValue,
          requireBothEmailPhone,
          generateDescription,
        })
        setCorrectSpelling(nextValue)
        setQuestionStep(spellingQuestionIndex + 1)
      },
    })

    if (templateName === "Grow Easy CRM") {
      const descriptionQuestionIndex = questions.length
      questions.push({
        key: "description",
        label: "Generate text from row data",
        detail: "AI fills the description/notes field from each row. Uses more AI output tokens and shows yellow review highlights.",
        value: generateDescription,
        onAnswer: (nextValue: boolean) => {
          saveValidateSession(importId, {
            phase: "setup",
            questionStep: descriptionQuestionIndex + 1,
            removeBlankRows: removeBlankRows ?? initialRemoveBlankRows,
            dashValuesBlank: dashValuesBlank ?? initialDashValuesBlank,
            correctSpelling,
            requireBothEmailPhone,
            generateDescription: nextValue,
          })
          setGenerateDescription(nextValue)
          setQuestionStep(descriptionQuestionIndex + 1)
        },
      })
    }

    const contactQuestionIndex = questions.length
	    questions.push({
	      key: "contact",
	        label: "Require both email and phone",
	        detail: "After AI extraction: Yes needs both email and phone. No accepts either one; both missing is invalid.",
        value: requireBothEmailPhone,
        onAnswer: (nextValue: boolean) => {
          saveValidateSession(importId, {
            phase: "cleaning",
            questionStep: contactQuestionIndex,
            removeBlankRows: removeBlankRows ?? initialRemoveBlankRows,
            dashValuesBlank: dashValuesBlank ?? initialDashValuesBlank,
            correctSpelling: resolvedCorrectSpelling,
            requireBothEmailPhone: nextValue,
            generateDescription: resolvedGenerateDescription,
          })
          setRequireBothEmailPhone(nextValue)
          setPhase("cleaning")
        },
      })

    return questions
  }, [importId, templateName, removeBlankRows, dashValuesBlank, correctSpelling, requireBothEmailPhone, generateDescription, resolvedCorrectSpelling, resolvedGenerateDescription, initialRemoveBlankRows, initialDashValuesBlank])

  const safeQuestionStep = Math.min(questionStep, Math.max(0, setupQuestions.length - 1))
  const activeQuestion = setupQuestions[safeQuestionStep]
  const visibleQuestions = setupQuestions.slice(0, safeQuestionStep + 1)

  if (phase === "setup") {
    return (
      <div
        className={cn(
          "flex flex-1 transform-gpu flex-col items-center justify-center gap-3 transition-transform duration-500 ease-out animate-in fade-in",
          questionStep > 0 && "-translate-y-2",
        )}
      >
        <div className="grid w-full max-w-xl gap-2">
          {visibleQuestions.map((question, index) => (
            <QuestionOption
              key={question.key}
              checked={question.value}
              onCheckedChange={index === safeQuestionStep ? (value) => activeQuestion.onAnswer(Boolean(value)) : undefined}
              label={question.label}
              detail={question.detail}
              disabled={index < questionStep}
              active={index === safeQuestionStep}
            />
          ))}
        </div>
      </div>
    )
  }

  if (phase === "cleaning") {
    return (
      <div className={cn("flex flex-1 flex-col justify-center items-center gap-2 animate-in fade-in duration-500 ease-out -translate-y-2")}>
        <div className="w-full max-w-xl space-y-2">
          {setupQuestions.map((question) => (
            <QuestionOption
              key={question.key}
              checked={question.value}
              label={question.label}
              detail={question.detail}
              disabled
              active={false}
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
      <div className={cn("flex flex-1 flex-col justify-center items-center gap-2 animate-in fade-in duration-500 ease-out -translate-y-2")}>
      <div className="w-full max-w-xl space-y-2">
        {setupQuestions.map((question) => (
          <QuestionOption
            key={question.key}
            checked={question.value}
            label={question.label}
            detail={question.detail}
            disabled
            active={false}
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
      <Button
        className="w-full max-w-xl"
        render={<Link href={`/upload/${importId}/preview`} />}
      >
        Continue to preview
        <ArrowRightIcon />
      </Button>
    </div>
  )
}

function QuestionOption({
  checked,
  onCheckedChange,
  label,
  detail,
  disabled = false,
  active = false,
}: {
  checked: boolean | null
  onCheckedChange?: (checked: boolean) => void
  label: string
  detail: ReactNode
  disabled?: boolean
  active?: boolean
}) {
  return (
    <div
      className={cn(
        "grid transform-gpu gap-2 rounded-lg border px-4 py-3 transition-[background-color,border-color,box-shadow,opacity,transform] duration-500 ease-out sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4",
        "animate-validate-question-enter",
        active ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10" : "border-border/40 bg-card/40",
        disabled && "opacity-85",
      )}
    >
      <div className="min-w-0 text-left">
        <p className="text-sm font-medium">{label}</p>
        <div className="mt-0.5 text-xs text-muted-foreground">{renderDetailWithTokenWarning(detail)}</div>
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
            "h-6 min-w-10 rounded-md px-2.5 text-xs transition-all duration-300",
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
            "h-6 min-w-10 rounded-md px-2.5 text-xs transition-all duration-300",
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

function renderDetailWithTokenWarning(detail: ReactNode) {
  if (typeof detail !== "string") {
    return detail
  }

  const tokenWarning = detail.match(/more AI(?: output)? tokens/i)?.[0]

  if (!tokenWarning) {
    return detail
  }

  const [before, after = ""] = detail.split(tokenWarning)

  return (
    <>
      {before}
      <span className="font-semibold text-amber-400/85">
        {tokenWarning}
      </span>
      {after}
    </>
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
  correctSpelling?: boolean | null
  requireBothEmailPhone?: boolean | null
  generateDescription?: boolean | null
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
