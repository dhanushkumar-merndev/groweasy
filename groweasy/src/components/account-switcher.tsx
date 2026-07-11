"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  Loader2Icon,
  LogOutIcon,
  PlusIcon,
  SwitchCameraIcon,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarMenuButton,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { API_BASE } from "@/lib/api-client"
import type { CurrentUser } from "@/lib/auth-types"
import { cn } from "@/lib/utils"

const MAX_DEVICE_SESSIONS = 5

type DeviceSession = {
  session: {
    id: string
    token: string
    userId: string
    expiresAt: string
  }
  user: {
    id: string
    name: string
    email: string
    image?: string | null
  }
}

type SessionRow = {
  id: string
  token?: string
  name: string
  email: string
  image?: string | null
  expiresAt?: string
  active: boolean
}

function getInitials(name?: string | null, email?: string | null) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  const initials = words.length
    ? words.slice(0, 2).map((word) => word[0]).join("")
    : email?.slice(0, 2) ?? "GE"

  return initials.toUpperCase()
}

function formatExpiry(value?: string) {
  if (!value) return "Current session"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Saved session"

  return `Expires ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`
}

function getAvatarSrc(value?: string | null) {
  return value?.trim() || undefined
}

function buildRows(user: CurrentUser, sessions: DeviceSession[]): SessionRow[] {
  const currentFromDevice = sessions.find((item) => item.user.id === user.id)
  const current: SessionRow = {
    id: user.id,
    token: currentFromDevice?.session.token,
    name: user.name,
    email: user.email,
    image: user.image,
    expiresAt: currentFromDevice?.session.expiresAt,
    active: true,
  }

  const otherRows = sessions
    .filter((item) => item.user.id !== user.id)
    .map((item) => ({
      id: item.user.id,
      token: item.session.token,
      name: item.user.name,
      email: item.user.email,
      image: item.user.image,
      expiresAt: item.session.expiresAt,
      active: false,
    }))

  return [current, ...otherRows].slice(0, MAX_DEVICE_SESSIONS)
}

async function fetchDeviceSessions() {
  const response = await fetch(`${API_BASE}/api/auth/multi-session/list-device-sessions`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Unable to load signed-in accounts.")
  }

  return (await response.json()) as DeviceSession[]
}

export function AccountSwitcher({ user }: { user: CurrentUser }) {
  const [open, setOpen] = React.useState(false)
  const [sessions, setSessions] = React.useState<DeviceSession[]>([])
  const [loading, setLoading] = React.useState(true)
  const [pendingToken, setPendingToken] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const rows = React.useMemo(() => buildRows(user, sessions), [sessions, user])
  const userAvatarSrc = getAvatarSrc(user.image)
  const sessionLimitReached = rows.length >= MAX_DEVICE_SESSIONS
  const showSkeleton = loading && sessions.length === 0

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !user.isDemo) {
      setLoading(true)
    }

    setOpen(nextOpen)
  }

  React.useEffect(() => {
    if (!open || user.isDemo) return

    let cancelled = false

    async function loadSessions() {
      try {
        const data = await fetchDeviceSessions()

        if (!cancelled) {
          setSessions(data)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Unable to load signed-in accounts.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSessions()

    return () => {
      cancelled = true
    }
  }, [open, user.isDemo])

  async function switchSession(row: SessionRow) {
    if (row.active || !row.token) return

    setPendingToken(row.token)

    try {
      const response = await fetch(`${API_BASE}/api/auth/multi-session/set-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: row.token }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Unable to switch account.")
      }

      toast.success(`Switched to ${row.name}.`)
      window.location.assign("/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to switch account.")
      setPendingToken(null)
    }
  }

  async function addAccount() {
    if (sessionLimitReached) {
      toast.error("You can keep up to 5 accounts on this device.")
      return
    }

    setAdding(true)

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
        throw new Error(data.error?.message ?? "Unable to add Google account.")
      }

      window.location.assign(data.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add Google account.")
      setAdding(false)
    }
  }

  async function logout() {
    try {
      const deviceSessions = user.isDemo ? [] : await fetchDeviceSessions().catch(() => [])
      const currentSession = deviceSessions.find((item) => item.user.id === user.id)
      const hasNextSession = deviceSessions.some((item) => item.user.id !== user.id)

      if (currentSession?.session.token && hasNextSession) {
        const revokeResponse = await fetch(`${API_BASE}/api/auth/multi-session/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: currentSession.session.token }),
          credentials: "include",
        })

        if (revokeResponse.ok) {
          window.location.assign("/dashboard")
          return
        }
      }

      const res = await fetch(`${API_BASE}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      })

      if (res.ok || res.status === 401) window.location.assign("/login")
    } catch {
      window.location.assign("/login")
    }
  }

  async function logoutAll() {
    try {
      const deviceSessions = await fetchDeviceSessions()
      for (const item of deviceSessions) {
        if (item.session.token) {
          await fetch(`${API_BASE}/api/auth/multi-session/revoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken: item.session.token }),
            credentials: "include",
          })
        }
      }
    } catch {
      // best-effort
    }

    try {
      await fetch(`${API_BASE}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // best-effort
    }

    window.location.assign("/login")
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="h-12 rounded-lg border border-sidebar-border/70 bg-sidebar/40 hover:bg-sidebar-border/40 hover:text-sidebar-foreground active:bg-sidebar-border/40 data-open:hover:bg-sidebar-border/40 data-open:hover:text-sidebar-foreground"
                />
              }
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={userAvatarSrc} alt={user.name} referrerPolicy="no-referrer" />
                <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold text-foreground">
                  {getInitials(user.name, user.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-tight">
                {user.name}
              </span>
              <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={4} className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarImage src={userAvatarSrc} alt={user.name} referrerPolicy="no-referrer" />
                      <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold">
                        {getInitials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleOpenChange(true)}>
                <SwitchCameraIcon className="size-4" />
                Switch account
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
                <LogOutIcon className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch Account</DialogTitle>
            <DialogDescription>
              Signed-in Google accounts on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2" style={{ minHeight: "188px" }}>
            {showSkeleton
              ? Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5">
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-7 w-16 rounded-md" />
                  </div>
                ))
              : rows.map((row) => {
                  const rowAvatarSrc = getAvatarSrc(row.image)

                  return (
                  <div
                    key={row.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border bg-background p-2.5",
                      row.active
                        ? "border-primary/30 bg-primary/5"
                        : "cursor-pointer transition-colors hover:bg-muted/50"
                    )}
                    onClick={() => row.active ? null : void switchSession(row)}
                    role={row.active ? undefined : "button"}
                    tabIndex={row.active ? undefined : 0}
                    onKeyDown={(e) => {
                      if (!row.active && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault()
                        void switchSession(row)
                      }
                    }}
                  >
                    <Avatar className="size-9 rounded-lg">
                      <AvatarImage src={rowAvatarSrc} alt={row.name} referrerPolicy="no-referrer" />
                      <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold">
                        {getInitials(row.name, row.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{row.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{row.email}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatExpiry(row.expiresAt)}
                      </div>
                    </div>

                    {row.active ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        <CheckCircle2Icon className="size-3" />
                        Active
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!row.token || pendingToken === row.token}
                        onClick={(e) => { e.stopPropagation(); void switchSession(row) }}
                      >
                        {pendingToken === row.token ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : null}
                        Switch
                      </Button>
                    )}
                  </div>
                  )
                })}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 justify-center"
              disabled={user.isDemo || adding || sessionLimitReached}
              onClick={() => void addAccount()}
            >
              {adding ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              {sessionLimitReached ? "5 accounts added" : "Add account"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              disabled={user.isDemo || rows.length <= 1}
              onClick={() => void logoutAll()}
              title="Logout all accounts"
            >
              <LogOutIcon className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
