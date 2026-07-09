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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === configuredFrontendUrl || /^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true)
        return
      }

      callback(new Error("Origin is not allowed by CORS."))
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  })
)

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, origin: req.headers.origin }, "Incoming request")
  next()
})

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
})

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many auth requests. Try again shortly." } },
})

app.use("/api/auth", authLimiter, authRoutes)
app.use(express.json({ limit: "25mb" }))

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
