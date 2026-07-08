import { LoginForm } from "@/components/login-form"
import { isAuthConfigured } from "@/server/auth/auth"
import { getCurrentUser } from "@/server/auth/session"
import { redirect } from "next/navigation"

export default async function LoginPage() {
  if (isAuthConfigured()) {
    const user = await getCurrentUser()

    if (user) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_top_left,var(--accent),transparent_34%),var(--background)] p-6 md:p-10">
      <div className="w-full max-w-sm rounded-xl border bg-card/95 p-6 shadow-sm">
        <LoginForm authConfigured={isAuthConfigured()} />
      </div>
    </div>
  )
}
