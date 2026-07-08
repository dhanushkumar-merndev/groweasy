import Link from "next/link"

import { MobileStepper } from "@/components/mobile-stepper"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const steps = [
  { label: "Upload", href: "/upload" },
  { label: "Validate", href: "validate" },
  { label: "Preview", href: "preview" },
  { label: "AI Process", href: "process" },
  { label: "Review", href: "review" },
  { label: "Save / Export", href: "review" },
]

export function ImportStepLayout({
  importId,
  currentStep,
  children,
  primaryAction,
  secondaryAction,
}: {
  importId?: string
  currentStep: number
  children: React.ReactNode
  primaryAction?: React.ReactNode
  secondaryAction?: React.ReactNode
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <MobileStepper currentStep={currentStep} />
      <aside className="hidden rounded-lg border bg-card p-3 lg:block">
        <nav className="grid gap-1">
          {steps.map((step, index) => {
            const href = importId && step.href !== "/upload" ? `/upload/${importId}/${step.href}` : step.href

            return (
              <Button
                key={step.label}
                variant={index === currentStep ? "secondary" : "ghost"}
                className={cn("justify-start", index > currentStep && "text-muted-foreground")}
                render={<Link href={href} />}
              >
                <span className="flex size-5 items-center justify-center rounded-full border text-[0.7rem]">
                  {index + 1}
                </span>
                {step.label}
              </Button>
            )
          })}
        </nav>
      </aside>
      <section className="min-w-0 pb-20 md:pb-0">{children}</section>
      {(primaryAction || secondaryAction) && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background p-3 md:hidden">
          {secondaryAction}
          {primaryAction}
        </div>
      )}
    </div>
  )
}
