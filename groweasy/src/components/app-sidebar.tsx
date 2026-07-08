"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  BarChart3Icon,
  Clock3Icon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  SparklesIcon,
  Table2Icon,
  UploadCloudIcon,
} from "lucide-react"
import type { CurrentUser } from "@/server/auth/session"

const primaryNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Upload", url: "/upload", icon: UploadCloudIcon },
  { title: "Templates", url: "/templates", icon: FileSpreadsheetIcon },
  { title: "Tables", url: "/tables", icon: Table2Icon },
  { title: "Analytics", url: "/analytics", icon: BarChart3Icon },
  { title: "History", url: "/history", icon: HistoryIcon },
]

const secondaryNav = [
  { title: "Settings", url: "/settings", icon: Settings2Icon },
]

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: CurrentUser
}) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/dashboard" />}
            >
              <SparklesIcon className="size-5!" />
              <span className="text-base font-semibold">GrowEasy</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => {
                const Icon = item.icon
                const active = pathname === item.url || pathname.startsWith(`${item.url}/`)

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={active}
                      render={<Link href={item.url} />}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Redis cache">
                  <DatabaseIcon />
                  <span>Redis TTL: 1 day</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Batch defaults">
                  <Clock3Icon />
                  <span>75 rows / batch</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {secondaryNav.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton tooltip={item.title} render={<Link href={item.url} />}>
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                GE
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user?.name ?? "Excel Cleaner"}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user?.isDemo ? "Demo workspace" : user?.email ?? "Google login ready"}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
