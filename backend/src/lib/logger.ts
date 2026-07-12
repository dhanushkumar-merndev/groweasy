import pino from "pino"

/**
 * Shared pino logger instance.
 *
 * - Development: pretty-printed, colorized, LOG_LEVEL defaults to "info".
 * - Production: JSON output to stdout, level "info" (use LOG_LEVEL to override).
 *
 * Authorization headers, cookies, and BETTER_AUTH_SECRET are redacted.
 */
export const logger = process.env.NODE_ENV === "production"
  ? pino({
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie", "BETTER_AUTH_SECRET"],
    })
  : pino({
      level: process.env.LOG_LEVEL ?? "info",
      transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
      redact: ["req.headers.authorization", "req.headers.cookie", "BETTER_AUTH_SECRET"],
    })
