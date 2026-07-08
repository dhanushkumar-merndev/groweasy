import { NextResponse, type NextRequest } from "next/server"

const protectedPrefixes = [
  "/dashboard",
  "/upload",
  "/templates",
  "/tables",
  "/analytics",
  "/history",
  "/settings",
]

export function proxy(request: NextRequest) {
  const authConfigured = Boolean(
    process.env.BETTER_AUTH_SECRET &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.DATABASE_URL
  )

  if (!authConfigured) {
    return NextResponse.next()
  }

  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))
  const hasSession =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token")

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (request.nextUrl.pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
