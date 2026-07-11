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
  FileSpreadsheetIcon,
  BarChart3Icon,
  HistoryIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  SparklesIcon,
  Table2Icon,
  UploadCloudIcon,
} from "lucide-react"
import type { CurrentUser } from "@/lib/auth-types"
import { AccountSwitcher } from "@/components/account-switcher"

const primaryNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Upload", url: "/upload", icon: UploadCloudIcon },
  { title: "Templates", url: "/templates", icon: FileSpreadsheetIcon },
  { title: "Campaigns", url: "/campaigns", icon: Table2Icon },
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
              className="data-[slot=sidebar-menu-button]:p-1.5! hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground data-open:hover:bg-transparent data-open:hover:text-sidebar-foreground"
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
            <SidebarMenu className="space-y-1">
              {primaryNav.map((item) => {
                const Icon = item.icon
                const active = pathname === item.url || pathname.startsWith(`${item.url}/`)

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={active}
                      className={!active ? "hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground" : undefined}
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
            <SidebarMenu className="space-y-1">
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
        <AccountSwitcher
          user={
            user ?? {
              id: "demo",
              name: "Excel Cleaner",
              email: "Google login ready",
              image: null,
              isDemo: true,
            }
          }
        />
      </SidebarFooter>
    </Sidebar>
  )
}
