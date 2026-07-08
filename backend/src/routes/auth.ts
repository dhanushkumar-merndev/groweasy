import { Router } from "express"
import { toNodeHandler } from "better-auth/node"

import { auth } from "../server/auth/auth.js"

const router = Router()

router.all("/*", toNodeHandler(auth))

export default router
