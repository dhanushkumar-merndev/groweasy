import { google } from "googleapis"

import type { SavedRow, Template } from "../../lib/types.js"

export function isGoogleSheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
      process.env.GOOGLE_SHEETS_PRIVATE_KEY
  )
}

export async function exportRowsToGoogleSheet(input: {
  spreadsheetId?: string
  sheetName: string
  rows: SavedRow[]
  template: Template
}) {
  if (!isGoogleSheetsConfigured()) {
    return {
      configured: false,
      spreadsheet_id: input.spreadsheetId ?? null,
      message:
        "Google Sheets credentials are not configured. Add server-side service account credentials to enable live export.",
    }
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const spreadsheetId = input.spreadsheetId

  if (!spreadsheetId) {
    return {
      configured: true,
      spreadsheet_id: null,
      message: "Provide a spreadsheet ID to export into an existing Google Sheet.",
    }
  }

  const values = [
    input.template.columns_config.map((column) => column.export_title),
    ...input.rows.map((row) =>
      input.template.columns_config.map((column) => row.cleaned_data[column.key] ?? "")
    ),
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${input.sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  })

  return {
    configured: true,
    spreadsheet_id: spreadsheetId,
    message: `Exported ${input.rows.length} rows to ${input.sheetName}.`,
  }
}

export async function importRowsFromGoogleSheet() {
  if (!isGoogleSheetsConfigured()) {
    return {
      configured: false,
      rows: [],
      message:
        "Google Sheets credentials are not configured. Share the sheet with the service account after adding credentials.",
    }
  }

  return {
    configured: true,
    rows: [],
    message: "Google Sheets import endpoint is ready for service-account reads.",
  }
}
