"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  nativeButton,
  loading,
  autoLoading = true,
  children,
  disabled,
  onClick,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean; autoLoading?: boolean }) {
  const pathname = usePathname()
  const [pressedLoading, setPressedLoading] = React.useState(false)
  const loadingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoading = Boolean(loading || pressedLoading)

  React.useEffect(() => {
    const timer = setTimeout(() => setPressedLoading(false), 0)

    return () => clearTimeout(timer)
  }, [pathname])

  React.useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
      }
    }
  }, [])

  function clearPressedLoadingSoon() {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
    }
    loadingTimerRef.current = setTimeout(() => setPressedLoading(false), 1200)
  }

  function clearPressedLoadingOnNavigationTimeout() {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
    }
    loadingTimerRef.current = setTimeout(() => setPressedLoading(false), 15000)
  }

  function handleClick(event: Parameters<NonNullable<ButtonPrimitive.Props["onClick"]>>[0]) {
    const result = onClick?.(event) as unknown

    if (!autoLoading || loading || disabled || event.defaultPrevented || shouldSkipAutoLoading(event.currentTarget as HTMLElement)) {
      return result
    }

    const waitForNavigation = shouldWaitForNavigation(event, pathname)
    setPressedLoading(true)

    if (isPromiseLike(result)) {
      void result.finally(() => setPressedLoading(false))
    } else if (waitForNavigation) {
      clearPressedLoadingOnNavigationTimeout()
    } else {
      clearPressedLoadingSoon()
    }

    return result
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }), isLoading && "relative")}
      nativeButton={nativeButton ?? !("render" in props)}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2Icon className="size-4 animate-spin" />
        </span>
      )}
      <span className={cn("contents", isLoading && "invisible")}>{children}</span>
    </ButtonPrimitive>
  )
}

function shouldSkipAutoLoading(element: HTMLElement) {
  return (
    element.getAttribute("aria-haspopup") === "menu" ||
    element.getAttribute("aria-haspopup") === "dialog" ||
    element.getAttribute("data-no-auto-loading") === "true"
  )
}

function shouldWaitForNavigation(
  event: Parameters<NonNullable<ButtonPrimitive.Props["onClick"]>>[0],
  currentPathname: string,
) {
  if (
    "button" in event &&
    event.button !== 0 ||
    "metaKey" in event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  ) {
    return false
  }

  const anchor = (event.currentTarget as HTMLElement).closest("a")
  const href = anchor?.getAttribute("href")

  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false
  }

  if (anchor?.target && anchor.target !== "_self") {
    return false
  }

  try {
    const url = new URL(href, window.location.href)
    return url.origin === window.location.origin && url.pathname !== currentPathname
  } catch {
    return false
  }
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return Boolean(value && typeof value === "object" && "finally" in value && typeof (value as Promise<void>).finally === "function")
}

export { Button, buttonVariants }
