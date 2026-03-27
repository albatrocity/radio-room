import type { Request, Response, NextFunction } from "express"
import { fromNodeHeaders } from "better-auth/node"
import { auth } from "./server"

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })

    if (!session) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    if (session.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" })
      return
    }

    ;(req as any).platformUser = session.user
    ;(req as any).platformSession = session.session
    next()
  } catch {
    res.status(500).json({ error: "Internal server error" })
  }
}
