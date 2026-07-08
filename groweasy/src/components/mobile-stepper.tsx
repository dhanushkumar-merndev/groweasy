import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const steps = ["Upload", "Validate", "Preview", "AI Process", "Review", "Save / Export"]

export function MobileStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-2 overflow-x-auto">
        {steps.map((step, index) => (
          <div key={step} className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                index < currentStep && "border-primary bg-primary text-primary-foreground",
                index === currentStep && "border-primary text-primary",
                index > currentStep && "text-muted-foreground"
              )}
            >
              {index < currentStep ? <CheckIcon className="size-3" /> : index + 1}
            </span>
            <span className="text-xs font-medium">{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
