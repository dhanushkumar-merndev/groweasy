import type { Response } from "express"
import { ZodError, type ZodSchema } from "zod"

import type { ApiError } from "../lib/types.js"
import { logger } from "../lib/logger.js"

export function jsonOk<T>(res: Response, data: T, status = 200) {
  return res.status(status).json(data)
}

export function jsonError(res: Response, code: string, message: string, status = 400) {
  return res.status(status).json({
    error: { code, message },
  } satisfies ApiError)
}

export function parseJsonBody<T>(body: unknown, schema: ZodSchema<T>) {
  try {
    return schema.parse(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RequestValidationError(error.issues.map((issue) => issue.message).join(", "))
    }

    throw new RequestValidationError("Invalid JSON request body.")
  }
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RequestValidationError"
  }
}

export function handleRouteError(res: Response, error: unknown) {
  if (error instanceof RequestValidationError || error instanceof ZodError) {
    logger.warn({ err: error }, "Request validation failed")
    return jsonError(res, "BAD_REQUEST", error.message, 400)
  }

  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    logger.warn("Unauthorized route access")
    return jsonError(res, "UNAUTHORIZED", "Please sign in to continue.", 401)
  }

  logger.error({ err: error }, "Unhandled route error")
  return jsonError(res, "SERVER_ERROR", "Something went wrong. Please retry.", 500)
}
