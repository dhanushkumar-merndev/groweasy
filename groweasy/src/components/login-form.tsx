"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"
import { FileSpreadsheetIcon, Loader2Icon } from "lucide-react"

export function LoginForm({
  className,
  authConfigured = false,
  ...props
}: React.ComponentProps<"div"> & { authConfigured?: boolean }) {
  const [pending, setPending] = useState(false)

  async function signInWithGoogle() {
    setPending(true)

    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/dashboard",
          errorCallbackURL: "/login",
        }),
      })
      const data = (await response.json()) as { url?: string; error?: { message?: string } }

      if (!response.ok || !data.url) {
        throw new Error(data.error?.message ?? "Google sign-in is not configured yet.")
      }

      window.location.href = data.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start Google sign-in.")
      setPending(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void signInWithGoogle()
        }}
      >
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a href="/dashboard" className="flex flex-col items-center gap-2 font-medium">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FileSpreadsheetIcon className="size-5" />
              </div>
              <span className="sr-only">GrowEasy</span>
            </a>
            <h1 className="text-xl font-bold">Welcome to GrowEasy</h1>
            <FieldDescription>
              Sign in to clean spreadsheets, save valid rows, and export clean tables.
            </FieldDescription>
          </div>
          {!authConfigured ? (
            <Alert>
              <AlertTitle>Local demo mode</AlertTitle>
              <AlertDescription>
                Add Better Auth, Google, and database environment variables to enforce live Google sessions.
              </AlertDescription>
            </Alert>
          ) : null}
          <FieldSeparator>Continue with</FieldSeparator>
          <Field>
            <FieldLabel className="sr-only">Google</FieldLabel>
            <Button variant="outline" type="submit" disabled={pending} className="w-full">
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              Continue with Google
            </Button>
          </Field>
          {!authConfigured ? (
            <Field>
              <Button type="button" className="w-full" render={<a href="/dashboard" />}>
                Continue in demo mode
              </Button>
            </Field>
          ) : null}
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        Secrets stay on the server. Service-role, AI, Redis, and Google Sheet keys are never exposed to the frontend.
      </FieldDescription>
    </div>
  )
}
