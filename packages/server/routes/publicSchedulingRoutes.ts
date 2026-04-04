import type { Request, Response } from "express"
import * as scheduling from "../services/SchedulingService"

/**
 * Unauthenticated listing of **ready** shows (titles/times only).
 * See ADR 0029 (public scheduling read for local-remote).
 */
export async function getPublicReadyShows(_req: Request, res: Response) {
  try {
    const shows = await scheduling.findReadyShowsForPublic()
    res.json({ shows })
  } catch (error) {
    console.error("GET /api/public/scheduling/ready-shows:", error)
    res.status(500).json({ error: "Failed to list ready shows" })
  }
}

/**
 * Unauthenticated show + ordered segments (**ready** shows only). Used for segment id → OSC mapping.
 */
export async function getPublicReadyShowById(req: Request, res: Response) {
  try {
    const show = await scheduling.findReadyShowWithSegmentsForPublic(req.params.id)
    if (!show) {
      res.status(404).json({ error: "Show not found" })
      return
    }
    res.json({ show })
  } catch (error) {
    console.error("GET /api/public/scheduling/shows/:id:", error)
    res.status(500).json({ error: "Failed to fetch show" })
  }
}
