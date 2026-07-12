import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"
import { logger } from "../lib/logger.js"

/**
 * Express global error handler — last stop in the middleware chain.
 *
 * Catches three error categories:
 * 1. ZodError (400) — validation failures from parseJsonBody()
 * 2. "UNAUTHORIZED" string errors (401) — thrown by requireCurrentUser()
 * 3. Everything else (500) — unhandled, logged with error details redacted
 *
 * Mounted in app.ts via app.use() after all routes.
 */
export function globalErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues.map((i) => ({ path: i.path, message: i.message })), url: req.url }, "Zod validation error")
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: err.issues.map((i) => i.message).join(", ") },
    })
    return
  }

  if (err instanceof Error && err.message === "UNAUTHORIZED") {
    logger.warn({ url: req.url }, "Unauthorized request")
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Please sign in to continue." },
    })
    return
  }

  const message = err instanceof Error ? err.message : String(err)
  logger.error({ message, url: req.url }, "Unhandled server error")
  res.status(500).json({
    error: { code: "SERVER_ERROR", message: "Something went wrong. Please retry." },
  })
}
