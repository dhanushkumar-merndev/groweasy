import app from "./app.js"

const port = Number(process.env.PORT ?? 4000)

app.listen(port, () => {
  console.log(`[groweasy-backend] Listening on http://localhost:${port}`)
  console.log(`[groweasy-backend] Auth: /api/auth/*`)
  console.log(`[groweasy-backend] API: /api/imports, /api/templates, /api/tables, /api/analytics, /api/google-sheets`)
})
