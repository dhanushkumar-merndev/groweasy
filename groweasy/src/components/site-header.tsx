"use client"

import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/upload": "Upload",
  "/templates": "Templates",
  "/campaigns": "Campaigns",
  "/analytics": "Analytics",
  "/history": "History",
  "/settings": "Settings",
}

export function SiteHeader({
  title,
  description,
  actions,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
}) {
  const pathname = usePathname()
  const fallback = Object.entries(titles).find(([path]) => pathname.startsWith(path))?.[1] ?? "Workspace"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold md:text-base">{title ?? fallback}</h1>
          {description ? (
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
