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
  const hasSession =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token")

  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
