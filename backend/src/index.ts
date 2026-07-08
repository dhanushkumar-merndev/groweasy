import "dotenv/config"

import app from "./app.js"
import { logger } from "./lib/logger.js"

const port = Number(process.env.PORT ?? 4000)

const server = app.listen(port, () => {
  logger.info({ port }, "Server started")
  logger.info({ path: "/api/auth/*" }, "Auth routes mounted")
  logger.info({ paths: ["/api/clean-batch", "/api/imports", "/api/templates", "/api/tables", "/api/analytics", "/api/google-sheets"] }, "API routes mounted")
})

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error({ port }, "Port already in use. Stop the existing backend process or change PORT in backend/.env.")
    process.exit(1)
  }

  throw error
})

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
