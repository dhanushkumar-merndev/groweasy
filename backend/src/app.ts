import cors from "cors"
import express from "express"
import rateLimit from "express-rate-limit"

import { globalErrorHandler } from "./middleware/error-handler.js"
import authRoutes from "./routes/auth.js"
import cleanBatchRoutes from "./routes/clean-batch.js"
import importsRoutes from "./routes/imports.js"
import templatesRoutes from "./routes/templates.js"
import tablesRoutes from "./routes/tables.js"
import analyticsRoutes from "./routes/analytics.js"
import googleSheetsRoutes from "./routes/google-sheets.js"
import historyRoutes from "./routes/history.js"
import settingsRoutes from "./routes/settings.js"
import campaignRoutes from "./routes/campaigns.js"
import { logger } from "./lib/logger.js"

const app = express()
const configuredFrontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000"
const generalRateLimitMax = readNumberEnv("RATE_LIMIT_PER_MINUTE", 300, { min: 60, max: 2_000 })
const authRateLimitMax = readNumberEnv("AUTH_RATE_LIMIT_PER_MINUTE", 60, { min: 20, max: 500 })
const allowedOrigins = new Set(
  configuredFrontendUrl
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
)
const allowLocalhostOrigins = process.env.NODE_ENV !== "production"

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || (allowLocalhostOrigins && /^http:\/\/localhost:\d+$/.test(origin))) {
        callback(null, true)
        return
      }

      callback(new Error("Origin is not allowed by CORS."))
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  })
)

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  next()
})

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, origin: req.headers.origin }, "Incoming request")
  next()
})

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: generalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
})

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many auth requests. Try again shortly." } },
})

app.use(express.json({ limit: "25mb" }))

app.use("/api/auth", authLimiter, authRoutes)

app.use("/api/clean-batch", limiter, cleanBatchRoutes)

app.use("/api/imports", limiter, importsRoutes)

app.use("/api/templates", limiter, templatesRoutes)
app.use("/api/tables", limiter, tablesRoutes)
app.use("/api/analytics", limiter, analyticsRoutes)
app.use("/api/google-sheets", limiter, googleSheetsRoutes)
app.use("/api/history", limiter, historyRoutes)
app.use("/api/settings", limiter, settingsRoutes)
app.use("/api/campaigns", limiter, campaignRoutes)

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.use(globalErrorHandler)

export default app

function readNumberEnv(name: string, fallback: number, bounds: { min: number; max: number }) {
  const parsed = Number(process.env[name])

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(parsed), bounds.min), bounds.max)
}
