import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/server-api"

type AppShellProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export async function AppShell({ title, description, actions, children }: AppShellProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 70)",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={user} variant="inset" />
      <SidebarInset>
        <SiteHeader title={title} description={description} actions={actions} />
        <main className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:gap-6 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
