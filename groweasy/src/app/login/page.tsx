import { LoginForm } from "@/components/login-form"
import { LoginShowcase } from "@/components/login-showcase"
import { getCurrentUser, serverFetch } from "@/lib/server-api"
import { redirect } from "next/navigation"
import { ShieldCheckIcon } from "lucide-react"

type ConfigStatus = {
  auth: boolean
  supabase: boolean
  google_sheets: boolean
  redis: boolean
  groq: boolean
}

export default async function LoginPage() {
  const config = await serverFetch<ConfigStatus>("/auth/config").catch(
    () =>
      ({
        auth: false,
        supabase: false,
        google_sheets: false,
        redis: false,
        groq: false,
      }) satisfies ConfigStatus
  )

  if (config.auth) {
    const user = await getCurrentUser()
    if (user) redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-background text-zinc-50 font-sans relative flex flex-col md:flex-row overflow-x-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293720_1px,transparent_1px),linear-gradient(to_bottom,#1f293720_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="hidden md:flex md:w-[60%] relative bg-gradient-to-br from-background via-card/50 to-background overflow-hidden items-center justify-center border-r border-border/80">
        <LoginShowcase />
      </div>

      <div className="w-full md:w-[40%] flex flex-col justify-between items-center p-8 md:p-12 z-10 border-b md:border-b-0 md:border-l border-border/80 bg-background/80 backdrop-blur-md relative">
        <div className="my-auto w-full max-w-[440px]">
          <div className="bg-card/40 border border-border/60 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-sm">
            <LoginForm authConfigured={config.auth} />
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] text-zinc-500 flex items-center justify-center gap-1.5">
          <ShieldCheckIcon className="size-3 text-emerald-500/70" />
          <span>All integrations securely hosted server-side.</span>
        </div>
      </div>
    </div>
  )
}
