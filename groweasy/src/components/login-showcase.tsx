"use client"

import { useEffect, useReducer } from "react"
import {
  FileSpreadsheetIcon,
  SparklesIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  DatabaseIcon,
  CloudLightningIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
} from "lucide-react"

type RowData = {
  raw: string
  clean: string
  field: "Email" | "Phone" | "Company"
  issue: string
  fixed: boolean
}

const INITIAL_ROWS: RowData[] = [
  { field: "Email", raw: "sarah.conner@@gmail..com", clean: "sarah.conner@gmail.com", issue: "Double @ and dot", fixed: false },
  { field: "Phone", raw: "1234567", clean: "+1 (555) 123-4567", issue: "Missing area code", fixed: false },
  { field: "Company", raw: "", clean: "Skynet Corp (AI Filled)", issue: "Empty required field", fixed: false },
  { field: "Email", raw: "john_doe_yahoo.com", clean: "john_doe@yahoo.com", issue: "Missing @ symbol", fixed: false },
]

type Step = "idle" | "uploading" | "cleaning" | "done"

type State = {
  step: Step
  progress: number
  cleaningRowIndex: number
  rows: RowData[]
}

type Action =
  | { type: "ADVANCE_STEP" }
  | { type: "SET_PROGRESS"; value: number }
  | { type: "SET_CLEANING_ROW"; index: number }
  | { type: "FIX_ROW"; index: number }
  | { type: "FINISH_CLEANING" }
  | { type: "RESET" }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADVANCE_STEP": {
      const nextStep: Record<Step, Step> = { idle: "uploading", uploading: "cleaning", cleaning: "done", done: "idle" }
      const step = nextStep[state.step]
      if (step === "idle") {
        return { step, progress: 0, cleaningRowIndex: -1, rows: INITIAL_ROWS.map((r) => ({ ...r })) }
      }
      return { ...state, step }
    }
    case "SET_PROGRESS":
      return { ...state, progress: action.value }
    case "SET_CLEANING_ROW":
      return { ...state, cleaningRowIndex: action.index }
    case "FIX_ROW": {
      const rows = state.rows.map((r, i) => (i === action.index ? { ...r, fixed: true } : r))
      return { ...state, rows }
    }
    case "FINISH_CLEANING":
      return { ...state, cleaningRowIndex: -1 }
    case "RESET":
      return { step: "idle", progress: 0, cleaningRowIndex: -1, rows: INITIAL_ROWS.map((r) => ({ ...r })) }
    default:
      return state
  }
}

export function LoginShowcase() {
  const [state, dispatch] = useReducer(reducer, {
    step: "idle",
    progress: 0,
    cleaningRowIndex: -1,
    rows: INITIAL_ROWS.map((r) => ({ ...r })),
  })

  const { step, progress, cleaningRowIndex, rows } = state

  // Cycle steps every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "ADVANCE_STEP" })
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Sub-animations: upload progress
  useEffect(() => {
    if (step !== "uploading") return

    let current = 0
    const interval = setInterval(() => {
      current += 5
      dispatch({ type: "SET_PROGRESS", value: Math.min(current, 100) })
      if (current >= 100) clearInterval(interval)
    }, 100)
    return () => clearInterval(interval)
  }, [step])

  // Sub-animations: cleaning rows
  useEffect(() => {
    if (step !== "cleaning") return

    let rowIndex = 0
    const interval = setInterval(() => {
      if (rowIndex < INITIAL_ROWS.length) {
        dispatch({ type: "SET_CLEANING_ROW", index: rowIndex })
        dispatch({ type: "FIX_ROW", index: rowIndex })
        rowIndex++
      } else {
        clearInterval(interval)
        dispatch({ type: "FINISH_CLEANING" })
      }
    }, 1200)
    return () => clearInterval(interval)
  }, [step])

  return (
    <div className="flex h-full w-full flex-col justify-center items-center p-6 lg:p-12 text-white">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />

      <div className="max-w-xl w-full space-y-8 z-10">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <SparklesIcon className="size-3.5 animate-spin-slow" />
            AI-Driven Excel Engine
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight lg:text-4xl">
            Supercharge Your Lead Operations
          </h2>
          <p className="text-sm text-zinc-400 max-w-md">
            Instantly parse messy CSVs or Excel sheets, repair data formatting errors using state-of-the-art AI, and export production-ready datasets.
          </p>
        </div>

        {/* Live Mock Pipeline Window */}
        <div className="rounded-xl border border-border/80 bg-background/60 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 bg-card/40 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-red-500/80" />
              <span className="size-3 rounded-full bg-yellow-500/80" />
              <span className="size-3 rounded-full bg-green-500/80" />
            </div>
            <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
              <FileSpreadsheetIcon className="size-3.5 text-emerald-400" />
              leads_import_q3.csv
            </div>
            <div className="w-12" />
          </div>

          <div className="p-5 font-mono text-xs space-y-4 min-h-[260px]">
            {/* Step Indicators */}
            <div className="grid grid-cols-3 gap-2 border-b border-border/60 pb-3">
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                step === "uploading" ? "bg-card text-white font-medium" : "text-zinc-500"
              }`}>
                <RefreshCwIcon className={`size-3.5 ${step === "uploading" ? "animate-spin" : ""}`} />
                <span>1. Upload</span>
              </div>
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                step === "cleaning" ? "bg-card text-white font-medium animate-pulse" : "text-zinc-500"
              }`}>
                <SparklesIcon className="size-3.5" />
                <span>2. Clean AI</span>
              </div>
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                step === "done" ? "bg-card/60 text-emerald-400 font-semibold" : "text-zinc-500"
              }`}>
                <CheckCircle2Icon className="size-3.5" />
                <span>3. Sync</span>
              </div>
            </div>

            {step === "idle" && (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="size-10 rounded-full bg-card flex items-center justify-center border border-border/80 relative">
                  <FileSpreadsheetIcon className="size-5 text-zinc-400" />
                  <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-emerald-500" />
                </div>
                <div>
                  <p className="text-zinc-300 font-semibold flex items-center justify-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Ready for import
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">4 issues auto-detected in preview schema</p>
                </div>
                <div className="w-full max-w-[200px] h-1.5 bg-card rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500/20 w-0" />
                </div>
              </div>
            )}

            {step === "uploading" && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Uploading files to secure server cache...</span>
                  <span className="font-semibold text-emerald-400">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/80">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="bg-card/40 rounded p-2.5 border border-border/60 text-zinc-400 space-y-1">
                  <p className="text-[10px] text-zinc-500">{`> initializing secure sandbox environment...`}</p>
                  <p className="text-[10px] text-zinc-300">{`> detected columns: Name, Email, Phone, Company, Status`}</p>
                </div>
              </div>
            )}

            {step === "cleaning" && (
              <div className="space-y-2">
                <div className="grid grid-cols-[80px_1fr_1.2fr] gap-2 text-zinc-400 text-[10px] pb-1 border-b border-border/60 px-1.5 font-bold">
                  <span>FIELD</span>
                  <span>RAW DATA</span>
                  <span>AI CORRECTION</span>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto overflow-x-hidden">
                  {rows.map((row, idx) => (
                    <div
                      key={idx}
                      className={`grid grid-cols-[80px_1fr_1.2fr] gap-2 p-1.5 rounded transition-all duration-300 ${
                        cleaningRowIndex === idx
                          ? "bg-emerald-950/40 border border-emerald-500/30 text-white scale-[1.01]"
                          : row.fixed
                            ? "bg-card/20 text-zinc-400"
                            : "bg-card/40 text-zinc-300"
                      }`}
                    >
                      <span className="font-semibold text-zinc-400 truncate">{row.field}</span>
                      <span className="truncate line-through text-red-400 decoration-red-500/80 mr-2 flex items-center gap-1 min-w-0">
                        <AlertTriangleIcon className="size-3 text-red-500 shrink-0" />
                        <span className="truncate">{row.raw || "null"}</span>
                      </span>
                      <span className={`truncate flex items-center gap-1 min-w-0 ${
                        row.fixed ? "text-emerald-400 font-semibold" : "text-zinc-500"
                      }`}>
                        {row.fixed ? (
                          <>
                            <SparklesIcon className="size-3 text-emerald-400 shrink-0 animate-pulse" />
                            <span className="truncate">{row.clean}</span>
                          </>
                        ) : (
                          <span>Waiting...</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === "done" && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2Icon className="size-5 text-emerald-400 shrink-0 animate-bounce" />
                  <span>AI Pipeline Completed Successfully!</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-card/80 border border-border/80 p-2.5 rounded text-center">
                    <span className="block text-zinc-500 text-[10px]">TOTAL ROWS</span>
                    <span className="text-sm font-bold text-white">150</span>
                  </div>
                  <div className="bg-card/80 border border-border/80 p-2.5 rounded text-center">
                    <span className="block text-zinc-500 text-[10px]">AI FIXED</span>
                    <span className="text-sm font-bold text-emerald-400">4</span>
                  </div>
                  <div className="bg-card/80 border border-border/80 p-2.5 rounded text-center">
                    <span className="block text-zinc-500 text-[10px]">REJECTED</span>
                    <span className="text-sm font-bold text-red-400">0</span>
                  </div>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DatabaseIcon className="size-4 text-emerald-400" />
                    <span className="text-[11px] text-zinc-300">Synchronized with secure databases</span>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">LIVE</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/80 bg-card/20 p-4 space-y-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheckIcon className="size-4.5" />
            </div>
            <h4 className="text-sm font-bold text-zinc-200">Server-Side Privacy</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Credentials are processed on the server, never sent to the client browser.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/20 p-4 space-y-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <CloudLightningIcon className="size-4.5" />
            </div>
            <h4 className="text-sm font-bold text-zinc-200">Instant Live Preview</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Preview and filter rows instantly in real-time memory before saving.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
