import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"

export function globalErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: err.issues.map((i) => i.message).join(", ") },
    })
    return
  }

  if (err instanceof Error && err.message === "UNAUTHORIZED") {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Please sign in to continue." },
    })
    return
  }

  console.error("[unhandled]", err)
  res.status(500).json({
    error: { code: "SERVER_ERROR", message: "Something went wrong. Please retry." },
  })
}
