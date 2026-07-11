"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { GoogleIcon } from "@/components/icons/google-icon"
import { API_BASE } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { FileSpreadsheetIcon, ShieldAlertIcon, SparklesIcon, ArrowRightIcon } from "lucide-react"

export function LoginForm({
  className,
  authConfigured = false,
  ...props
}: React.ComponentProps<"div"> & { authConfigured?: boolean }) {
  const [isPending, startTransition] = useTransition()

  async function signInWithGoogle() {
    startTransition(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            callbackURL: `${window.location.origin}/dashboard`,
            errorCallbackURL: `${window.location.origin}/login`,
          }),
          credentials: "include",
        })
        const data = (await response.json()) as { url?: string; error?: { message?: string } }

        if (!response.ok || !data.url) {
          throw new Error(data.error?.message ?? "Google sign-in is not configured yet.")
        }

        window.location.href = data.url
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to start Google sign-in.")
      }
    })
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void signInWithGoogle()
        }}
        className="space-y-6"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <a href="/dashboard" className="flex flex-col items-center gap-2 group">
            {/* Logo box with pulse glow */}
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-zinc-950 font-bold shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
              <FileSpreadsheetIcon className="size-6 text-zinc-950" />
            </div>
          </a>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Welcome to GrowEasy
            </h1>
            <p className="text-xs text-zinc-400 max-w-[280px] mx-auto leading-normal">
              Sign in to clean spreadsheets, save valid rows, and export clean tables.
            </p>
          </div>
        </div>

        {/* Local Demo Warning Banner */}
        {!authConfigured ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-zinc-300 flex gap-3 text-[11px] leading-normal">
            <ShieldAlertIcon className="size-4.5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-400 block mb-0.5">Local Demo Mode Active</span>
              Add Better Auth, Google Client credentials, and database secrets to `.env` to enforce production Google sessions.
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {/* Custom Clean Separator */}
          <div className="relative flex items-center my-4">
            <div className="flex-grow border-t border-zinc-800/80" />
            <span className="flex-shrink mx-3.5 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
              Continue with
            </span>
            <div className="flex-grow border-t border-zinc-800/80" />
          </div>

          {/* Google Sign-in Button */}
          <Button
            variant="outline"
            type="submit"
            loading={isPending}
            className="w-full gap-2.5 py-5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:text-white text-zinc-200 transition-all font-semibold"
          >
            <GoogleIcon className="size-4" />
            {isPending ? "Connecting..." : "Sign in with Google"}
          </Button>

          {/* Continue in Demo Mode Action */}
          {!authConfigured ? (
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "default" }),
                "w-full py-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:scale-[1.01] flex items-center justify-center gap-1.5"
              )}
            >
              <SparklesIcon className="size-4" />
              Continue in Demo Mode
              <ArrowRightIcon className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </div>
      </form>

      <p className="px-4 text-center text-[10px] text-zinc-500 leading-normal">
        Secrets stay on the server. API keys, integrations, and database credentials are never exposed to the frontend.
      </p>
    </div>
  )
}
