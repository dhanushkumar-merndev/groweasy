import "server-only"

import { ZodError, type ZodSchema } from "zod"

import type { ApiError } from "@/lib/types"

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init)
}

export function jsonError(code: string, message: string, status = 400) {
  return Response.json(
    {
      error: { code, message },
    } satisfies ApiError,
    { status }
  )
}

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  try {
    const json = await request.json()

    return schema.parse(json)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RequestValidationError(error.issues.map((issue) => issue.message).join(", "))
    }

    throw new RequestValidationError("Invalid JSON request body.")
  }
}

export function parseSearchParams<T>(request: Request, schema: ZodSchema<T>) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())

  return schema.parse(params)
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RequestValidationError"
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof ZodError) {
    return jsonError("BAD_REQUEST", error.message, 400)
  }

  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return jsonError("UNAUTHORIZED", "Please sign in to continue.", 401)
  }

  return jsonError("SERVER_ERROR", "Something went wrong. Please retry.", 500)
}
