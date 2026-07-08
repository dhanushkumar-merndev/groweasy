import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"
import { logger } from "../lib/logger.js"

export function globalErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    logger.warn({ errors: err.issues, url: req.url }, "Zod validation error")
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

  logger.error({ err, url: req.url }, "Unhandled server error")
  res.status(500).json({
    error: { code: "SERVER_ERROR", message: "Something went wrong. Please retry." },
  })
}
