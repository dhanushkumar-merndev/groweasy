import { google } from "googleapis"

import type { SavedRow, Template } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

/**
 * Google Sheets integration via service account JWT.
 * Reads GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY from env.
 * Export builds header + row matrix and writes via sheets.spreadsheets.values.update.
 * Import endpoint is a stub — returns empty rows with a configuration message.
 */

export function isGoogleSheetsConfigured() {
  const configured = Boolean(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
      process.env.GOOGLE_SHEETS_PRIVATE_KEY
  )
  logger.debug({ configured }, "Google Sheets configuration check")
  return configured
}

export async function exportRowsToGoogleSheet(input: {
  spreadsheetId?: string
  sheetName: string
  rows: SavedRow[]
  template: Template
}) {
  if (!isGoogleSheetsConfigured()) {
    logger.warn("Google Sheets not configured, skipping export")
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
    logger.info("No spreadsheet ID provided for export")
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

  logger.info({ spreadsheetId, sheetName: input.sheetName, rowCount: input.rows.length }, "Exporting rows to Google Sheets")
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${input.sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  })
  logger.info({ spreadsheetId, rowCount: input.rows.length }, "Google Sheets export completed")

  return {
    configured: true,
    spreadsheet_id: spreadsheetId,
    message: `Exported ${input.rows.length} rows to ${input.sheetName}.`,
  }
}

export async function importRowsFromGoogleSheet() {
  if (!isGoogleSheetsConfigured()) {
    logger.warn("Google Sheets not configured, skipping import")
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
