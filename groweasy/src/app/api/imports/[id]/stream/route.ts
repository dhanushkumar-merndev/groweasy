import type { AiBatchResult } from "@/lib/types"
import { handleRouteError, jsonError } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { cacheKeys, getCache } from "@/server/redis/cache"
import { store } from "@/server/repositories/store"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const encoder = new TextEncoder()
    const totalBatches = Math.max(1, Math.ceil(job.total_rows / Number(process.env.AI_BATCH_SIZE ?? 75)))

    return new Response(
      new ReadableStream({
        async start(controller) {
          let processedRows = 0
          let goodCount = 0
          let missingCount = 0
          let skippedCount = 0
          let aiChangedCount = 0

          for (let batchNo = 1; batchNo <= totalBatches; batchNo += 1) {
            const batch = await getCache<AiBatchResult>(cacheKeys(id).batch(batchNo))

            if (!batch) {
              continue
            }

            processedRows += batch.rows.length
            goodCount += batch.summary.good_count
            missingCount += batch.summary.missing_count
            skippedCount += batch.summary.skipped_count
            aiChangedCount += batch.summary.ai_changed_count

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "batch_completed",
                  batch_no: batchNo,
                  total_batches: totalBatches,
                  good_count: goodCount,
                  missing_count: missingCount,
                  skipped_count: skippedCount,
                  ai_changed_count: aiChangedCount,
                })}\n\n`
              )
            )
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  processed_rows: processedRows,
                  total_rows: job.total_rows,
                  percent: job.total_rows > 0 ? Math.round((processedRows / job.total_rows) * 100) : 100,
                })}\n\n`
              )
            )
            await wait(250)
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "completed",
                import_id: id,
              })}\n\n`
            )
          )
          controller.close()
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    )
  } catch (error) {
    return handleRouteError(error)
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
