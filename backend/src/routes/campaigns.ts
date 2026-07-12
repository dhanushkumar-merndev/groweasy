import { Router } from "express"
import { z } from "zod"

import { handleRouteError, jsonOk, jsonError, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"

/**
 * Campaign routes — group saved rows into named campaigns for bulk operations.
 *
 * GET    /              — List campaigns for current user
 * POST   /              — Create a new campaign
 * DELETE /:campaignId   — Delete a campaign
 * POST   /:campaignId/rows         — Add a saved row to a campaign
 * DELETE /:campaignId/rows/:rowId  — Remove a row from a campaign
 */

const router = Router()

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const campaigns = store.listCampaigns(user.id)
    return jsonOk(res, { campaigns })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body)
    const campaign = store.createCampaign(user.id, name)
    return jsonOk(res, { campaign }, 201)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/:campaignId", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { campaignId } = req.params
    store.deleteCampaign(user.id, campaignId)
    return jsonOk(res, { deleted: true })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/:campaignId/rows", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { campaignId } = req.params
    const { rowId } = z.object({ rowId: z.string().uuid() }).parse(req.body)
    const ok = store.addRowToCampaign(user.id, campaignId, rowId)
    if (!ok) return jsonError(res, "CAMPAIGN_NOT_FOUND", "Campaign not found.", 404)
    return jsonOk(res, { added: true })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/:campaignId/rows/:rowId", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { campaignId, rowId } = req.params
    const ok = store.removeRowFromCampaign(user.id, campaignId, rowId)
    if (!ok) return jsonError(res, "CAMPAIGN_NOT_FOUND", "Campaign not found.", 404)
    return jsonOk(res, { removed: true })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
