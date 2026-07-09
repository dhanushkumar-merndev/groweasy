"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon } from "lucide-react"
import {
  clearUploadSession,
  consumeHardReloadNavigationReset,
  consumeUploadResetOnReload,
  hasUploadDraft,
  markUploadResetOnUnload,
} from "@/lib/upload-draft"
import { ensureLocalImport, readLocalImport } from "@/lib/local-import-store"
import { readLocalValidationPreview } from "@/lib/local-validation-preview"
import type { ImportStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MobileStepper } from "./mobile-stepper"

const steps = [
  { label: "Upload",       href: "/upload" },
  { label: "Validate",     href: "validate" },
  { label: "Preview",      href: "preview" },
  { label: "AI Process",   href: "process" },
  { label: "Review",       href: "review" },
  { label: "Save / Export",href: "export" },
]

export function ImportStepLayout({
  importId,
  currentStep,
  children,
  primaryAction,
  secondaryAction,
  importStatus,
}: {
  importId?: string
  currentStep: number
  children: React.ReactNode
  primaryAction?: React.ReactNode
  secondaryAction?: React.ReactNode
  importStatus?: ImportStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localProgressStep, setLocalProgressStep] = useState(0)
  const [navigatingIndex, setNavigatingIndex] = useState<number | null>(null)

  // Track previous step for animation direction
  const prevStepRef = useRef<number>(currentStep)
  const [, setDisplayStep] = useState(currentStep)
  const [animState, setAnimState] = useState<"idle" | "exit" | "enter">("idle")
  const directionRef = useRef(0)

  useEffect(() => {
    if (currentStep === prevStepRef.current) return

    const dir = currentStep > prevStepRef.current ? 1 : -1
    directionRef.current = dir
    prevStepRef.current = currentStep
    setNavigatingIndex(null)

    // Phase 1 – exit current content
    setAnimState("exit")

    const t1 = setTimeout(() => {
      // Phase 2 – swap content, position new content off-screen to the right
      setDisplayStep(currentStep)
      setAnimState("enter")
    }, 280)

    const t2 = setTimeout(() => {
      setAnimState("idle")
    }, 580)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [currentStep])

  useEffect(() => {
    if (
      !importId ||
      currentStep === 0 ||
      (!consumeUploadResetOnReload(importId) && !consumeHardReloadNavigationReset())
    ) {
      return
    }

    if (!hasUploadDraft()) {
      return
    }

    clearUploadSession(importId)
    router.replace("/upload")
  }, [currentStep, importId, router])

  useEffect(() => {
    if (!importId || currentStep === 0) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUploadDraft()) return

      event.preventDefault()
      event.returnValue = ""
    }

    const handlePageHide = () => {
      if (!hasUploadDraft()) return

      markUploadResetOnUnload(importId)
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [currentStep, importId])

  useEffect(() => {
    if (!importId) {
      return
    }

    const frame = window.requestAnimationFrame(async () => {
      const hasLocalImport = Boolean(readLocalImport(importId)) || Boolean(await ensureLocalImport(importId))
      const hasValidatedPreview = Boolean(readLocalValidationPreview(importId))
      const reachedStep = readReachedStep(importId)

      if (hasValidatedPreview) {
        setLocalProgressStep(Math.max(2, reachedStep))
        return
      }

      if (hasLocalImport) {
        setLocalProgressStep(Math.max(1, reachedStep))
        return
      }

      setLocalProgressStep(reachedStep)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [currentStep, importId])

  useEffect(() => {
    if (!importId) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      saveReachedStep(importId, currentStep)
      setLocalProgressStep((step) => Math.max(step, currentStep))
    })

    return () => window.cancelAnimationFrame(frame)
  }, [currentStep, importId])

  const handleNavigate = (href: string, index: number) => {
    if (isPending) return
    setNavigatingIndex(index)
    startTransition(() => {
      router.push(href)
    })
  }


  const progressStep = Math.max(getProgressStep(importStatus), localProgressStep)
  const maxUnlockedStep = importId
    ? Math.max(progressStep, currentStep)
    : 0

  return (
    <>
    <div className="grid flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] auto-rows-[minmax(0,1fr)]">
      <MobileStepper currentStep={currentStep} />

      {/* ── Sidebar ── */}
      <aside className="hidden self-start rounded-xl border border-border/40 bg-muted/30 p-3 lg:block">
        <nav className="relative grid gap-0.5">
          {/* Sliding pill indicator */}
          <div
            className="absolute left-0 right-0 h-9 rounded-lg bg-sidebar-accent pointer-events-none z-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ transform: `translateY(${currentStep * 38}px)` }}
          />

          {steps.map((step, index) => {
            const isActive    = index === currentStep
            const isCompleted = !isActive && (index < currentStep || index < progressStep)
            const isUnlocked = importId ? index <= maxUnlockedStep : index === 0
            const href = isUnlocked ? getStepHref(index, importId) : null

            const inner = (
              <div
                className={cn(
                  "relative z-10 flex items-center gap-2.5 px-3 h-9 rounded-lg w-full text-sm font-medium select-none",
                  "transition-colors duration-150",
                  isActive && "text-sidebar-accent-foreground",
                  isCompleted && !isActive && "text-sidebar-accent-foreground/70",
                  !isActive && !isCompleted && "text-muted-foreground/70",
                  // Only navigable items get hover styling – but subtle, not a "pressed" look
                  href && !isActive && "hover:text-foreground cursor-pointer",
                  !href && "cursor-default opacity-40",
                )}
              >
                {/* Step number / check / loader */}
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[0.65rem] font-bold shrink-0",
                    "border transition-all duration-300",
                    isActive    && "border-sidebar-accent-foreground/50 bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground scale-110",
                    isCompleted && "border-transparent bg-primary/20 text-primary",
                    !isActive && !isCompleted && "border-border/60",
                    navigatingIndex === index && "animate-pulse",
                  )}
                >
                  {navigatingIndex === index ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : isCompleted ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.label}
              </div>
            )

            return href ? (
              <div
                key={step.label}
                onClick={() => handleNavigate(href, index)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleNavigate(href, index)
                  }
                }}
                className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg cursor-pointer"
              >
                {inner}
              </div>
            ) : (
              <div key={step.label}>{inner}</div>
            )
          })}
        </nav>
      </aside>

      {/* ── Main content with slide transitions ── */}
      <section className="min-w-0 pb-20 md:pb-0 relative flex flex-col min-h-[300px]">
        {isPending && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[1px] animate-in fade-in duration-200">
            <div className="flex flex-col items-center gap-2">
              <Loader2Icon className="size-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground font-medium">Loading step...</p>
            </div>
          </div>
        )}
        <div
          className="flex flex-1 flex-col min-h-0"
          style={{
            willChange: "transform, opacity",
            transition: animState === "idle" ? "none" : "transform 280ms cubic-bezier(0.4,0,0.2,1), opacity 280ms ease",
            transform:
              animState === "exit"
                ? "translateX(-40px)"
                : animState === "enter"
                ? "translateX(40px)"
                : "translateX(0)",
            opacity: animState === "idle" ? 1 : 0,
          }}
        >
          <div className="flex flex-1 flex-col">{children}</div>

          {/* Desktop action buttons */}
          {(primaryAction || secondaryAction) && (
            <div className="hidden md:flex justify-end gap-2.5 border-t border-border/30 pt-4 mt-8">
              {secondaryAction && (
                <div className="[&_[data-slot=button]]:!px-4 [&_[data-slot=button]]:!h-8 [&_[data-slot=button]]:!text-xs [&_[data-slot=button]]:!w-auto">
                  {secondaryAction}
                </div>
              )}
              {primaryAction && (
                <div className="[&_[data-slot=button]]:!px-4 [&_[data-slot=button]]:!h-8 [&_[data-slot=button]]:!text-xs [&_[data-slot=button]]:!w-auto">
                  {primaryAction}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Mobile bottom action bar */}
      {(primaryAction || secondaryAction) && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-end gap-2 border-t bg-background p-3 md:hidden">
          {secondaryAction && (
            <div className="[&_[data-slot=button]]:!px-4 [&_[data-slot=button]]:!h-8 [&_[data-slot=button]]:!text-xs [&_[data-slot=button]]:!w-auto">
              {secondaryAction}
            </div>
          )}
          {primaryAction && (
            <div className="[&_[data-slot=button]]:!px-4 [&_[data-slot=button]]:!h-8 [&_[data-slot=button]]:!text-xs [&_[data-slot=button]]:!w-auto">
              {primaryAction}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}

function getProgressStep(status?: ImportStatus) {
  switch (status) {
    case "validated":
      return 2
    case "processing":
      return 3
    case "processed":
      return 4
    case "saved":
      return 5
    default:
      return 0
  }
}

function getStepHref(index: number, importId?: string) {
  if (!importId) {
    return index === 0 ? "/upload" : null
  }

  if (index === 0) {
    return `/upload/${importId}`
  }

  if (index === 1) {
    return `/upload/${importId}/validate`
  }

  if (index === 2) {
    return `/upload/${importId}/preview`
  }

  if (index === 3) {
    return `/upload/${importId}/process`
  }

  if (index === 4) {
    return `/upload/${importId}/review`
  }

  if (index === 5) {
    return `/upload/${importId}/export`
  }

  return null
}

function reachedStepKey(importId: string) {
  return `groweasy-import-reached-step:${importId}`
}

function readReachedStep(importId: string) {
  if (typeof window === "undefined") {
    return 0
  }

  const value = Number(window.sessionStorage.getItem(reachedStepKey(importId)))
  return Number.isFinite(value) ? value : 0
}

function saveReachedStep(importId: string, step: number) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem(reachedStepKey(importId), String(Math.max(readReachedStep(importId), step)))
}
