import cors from "cors"
import express from "express"
import multer from "multer"

import { globalErrorHandler } from "./middleware/error-handler.js"
import authRoutes from "./routes/auth.js"
import cleanBatchRoutes from "./routes/clean-batch.js"
import importsRoutes from "./routes/imports.js"
import templatesRoutes from "./routes/templates.js"
import tablesRoutes from "./routes/tables.js"
import analyticsRoutes from "./routes/analytics.js"
import googleSheetsRoutes from "./routes/google-sheets.js"
import historyRoutes from "./routes/history.js"
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, origin: req.headers.origin }, "Incoming request")
  next()
})

app.use("/api/auth", authRoutes)
app.use("/api/clean-batch", express.json({ limit: "25mb" }), cleanBatchRoutes)

app.use("/api/imports", upload.single("file"), importsRoutes)

app.use(express.json({ limit: "25mb" }))

app.use("/api/templates", templatesRoutes)
app.use("/api/tables", tablesRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/google-sheets", googleSheetsRoutes)
app.use("/api/history", historyRoutes)

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.use(globalErrorHandler)

export default app
