import pino from "pino"

export const logger = process.env.NODE_ENV === "production"
  ? pino({ level: "silent" })
  : pino({
      level: process.env.LOG_LEVEL ?? "info",
      transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
      redact: ["req.headers.authorization", "req.headers.cookie", "BETTER_AUTH_SECRET"],
    })
