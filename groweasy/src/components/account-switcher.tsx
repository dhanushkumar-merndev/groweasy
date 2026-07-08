"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  ChevronUpIcon,
  Loader2Icon,
  PlusIcon,
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
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { API_BASE } from "@/lib/api-client"
import type { CurrentUser } from "@/lib/server-api"
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

export function AccountSwitcher({ user }: { user: CurrentUser }) {
  const [open, setOpen] = React.useState(false)
  const [sessions, setSessions] = React.useState<DeviceSession[]>([])
  const [loading, setLoading] = React.useState(false)
  const [pendingToken, setPendingToken] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const rows = React.useMemo(() => buildRows(user, sessions), [sessions, user])
  const sessionLimitReached = rows.length >= MAX_DEVICE_SESSIONS

  React.useEffect(() => {
    if (!open || user.isDemo) return

    let cancelled = false

    async function loadSessions() {
      setLoading(true)

      try {
        const response = await fetch(`${API_BASE}/api/auth/multi-session/list-device-sessions`, {
          credentials: "include",
        })

        if (!response.ok) {
          throw new Error("Unable to load signed-in accounts.")
        }

        const data = (await response.json()) as DeviceSession[]

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

  return (
    <>
      <SidebarMenuButton
        size="lg"
        className="h-12 rounded-lg border border-sidebar-border/70 bg-sidebar/40 hover:bg-sidebar-border/40 hover:text-sidebar-foreground active:bg-sidebar-border/40 data-open:hover:bg-sidebar-border/40 data-open:hover:text-sidebar-foreground"
        onClick={() => setOpen(true)}
      >
        <Avatar className="size-8 rounded-lg">
          <AvatarImage src={user.image ?? undefined} alt={user.name} />
          <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold text-foreground">
            {getInitials(user.name, user.email)}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.isDemo ? "Demo workspace" : user.email}
          </span>
        </span>
        <ChevronUpIcon className="ml-auto size-4 text-muted-foreground" />
      </SidebarMenuButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch Account</DialogTitle>
            <DialogDescription>
              Signed-in Google accounts on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-background p-2.5",
                  row.active && "border-primary/30 bg-primary/5"
                )}
              >
                <Avatar className="size-9 rounded-lg">
                  <AvatarImage src={row.image ?? undefined} alt={row.name} />
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
                    onClick={() => void switchSession(row)}
                  >
                    {pendingToken === row.token ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : null}
                    Switch
                  </Button>
                )}
              </div>
            ))}

            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Loading accounts
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            disabled={user.isDemo || adding || sessionLimitReached}
            onClick={() => void addAccount()}
          >
            {adding ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            {sessionLimitReached ? "5 accounts added" : "Add Google account"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
