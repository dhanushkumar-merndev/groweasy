import cors from "cors"
import express from "express"
import multer from "multer"

import { globalErrorHandler } from "./middleware/error-handler.js"
import authRoutes from "./routes/auth.js"
import importsRoutes from "./routes/imports.js"
import templatesRoutes from "./routes/templates.js"
import tablesRoutes from "./routes/tables.js"
import analyticsRoutes from "./routes/analytics.js"
import googleSheetsRoutes from "./routes/google-sheets.js"

const app = express()

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  })
)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

app.use("/api/auth", authRoutes)

app.use("/api/imports", upload.single("file"), importsRoutes)

app.use(express.json())

app.use("/api/templates", templatesRoutes)
app.use("/api/tables", tablesRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/google-sheets", googleSheetsRoutes)

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.use(globalErrorHandler)

export default app
