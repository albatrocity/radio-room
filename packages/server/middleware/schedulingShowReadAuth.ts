import type { Request, Response, NextFunction } from "express"
import { getPlatformAdminSession } from "@repo/auth/platformSession"
import type { AppContext } from "@repo/types"
import { findRoom, getUser } from "../operations/data"

/** Client sends the listening-room Redis user id (same value as web sessionStorage `radio-session-id`). */
export const RADIO_SESSION_HEADER = "x-radio-session-id"

export async function schedulingShowReadAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getPlatformAdminSession(req)
    if (session) {
      ;(req as any).platformUser = session.user
      ;(req as any).platformSession = session.session
      next()
      return
    }

    const userId = req.get(RADIO_SESSION_HEADER)?.trim()
    const roomId = typeof req.query.roomId === "string" ? req.query.roomId.trim() : ""
    const showId = req.params.id

    if (!userId || !roomId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const context = (req as any).context as AppContext
    const [user, room] = await Promise.all([
      getUser({ context, userId }),
      findRoom({ context, roomId }),
    ])

    if (!user || !room || room.showId !== showId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    next()
  } catch {
    res.status(500).json({ error: "Internal server error" })
  }
}
