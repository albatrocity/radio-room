import { Router, Request, Response } from "express"
import type { TagType } from "@repo/types"
import * as scheduling from "../services/SchedulingService"

export function createSchedulingRouter(): Router {
  const router = Router()

  // =========================================================================
  // Shows
  // =========================================================================

  router.get("/shows", async (req: Request, res: Response) => {
    try {
      const { search, startDate, endDate, status, startTimeOrder } = req.query
      const shows = await scheduling.findShows({
        search: search as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        status: status as any,
        startTimeOrder:
          startTimeOrder === "asc" || startTimeOrder === "desc"
            ? startTimeOrder
            : undefined,
      })
      res.json({ shows })
    } catch (error) {
      console.error("Error listing shows:", error)
      res.status(500).json({ error: "Failed to list shows" })
    }
  })

  router.post("/shows", async (req: Request, res: Response) => {
    try {
      const createdBy = (req as any).platformUser?.id
      if (!createdBy) {
        res.status(401).json({ error: "Unauthorized" })
        return
      }
      const show = await scheduling.createShow(req.body, createdBy)
      res.status(201).json({ show })
    } catch (error) {
      console.error("Error creating show:", error)
      res.status(500).json({ error: "Failed to create show" })
    }
  })

  router.get("/shows/:id", async (req: Request, res: Response) => {
    try {
      const show = await scheduling.findShowById(req.params.id)
      if (!show) {
        res.status(404).json({ error: "Show not found" })
        return
      }
      res.json({ show })
    } catch (error) {
      console.error("Error fetching show:", error)
      res.status(500).json({ error: "Failed to fetch show" })
    }
  })

  router.put("/shows/:id", async (req: Request, res: Response) => {
    try {
      const show = await scheduling.updateShow(req.params.id, req.body)
      if (!show) {
        res.status(404).json({ error: "Show not found" })
        return
      }
      res.json({ show })
    } catch (error) {
      console.error("Error updating show:", error)
      res.status(500).json({ error: "Failed to update show" })
    }
  })

  router.delete("/shows/:id", async (req: Request, res: Response) => {
    try {
      const show = await scheduling.deleteShow(req.params.id)
      if (!show) {
        res.status(404).json({ error: "Show not found" })
        return
      }
      res.json({ success: true })
    } catch (error) {
      console.error("Error deleting show:", error)
      res.status(500).json({ error: "Failed to delete show" })
    }
  })

  router.put("/shows/:id/segments", async (req: Request, res: Response) => {
    try {
      const { segmentIds } = req.body
      if (!Array.isArray(segmentIds)) {
        res.status(400).json({ error: "segmentIds must be an array" })
        return
      }
      const segments = await scheduling.reorderShowSegments(req.params.id, segmentIds)
      res.json({ segments })
    } catch (error) {
      console.error("Error reordering show segments:", error)
      res.status(500).json({ error: "Failed to reorder segments" })
    }
  })

  router.patch("/shows/:showId/segments/:segmentId", async (req: Request, res: Response) => {
    try {
      const body = req.body as { durationOverride?: unknown }
      if (!("durationOverride" in body)) {
        res.status(400).json({ error: "durationOverride is required (number of minutes or null)" })
        return
      }
      const durationOverride = body.durationOverride
      if (
        durationOverride !== null &&
        (typeof durationOverride !== "number" ||
          !Number.isInteger(durationOverride) ||
          durationOverride < 0)
      ) {
        res.status(400).json({ error: "durationOverride must be a non-negative integer or null" })
        return
      }
      const value = durationOverride
      const row = await scheduling.updateShowSegmentDuration(
        req.params.showId,
        req.params.segmentId,
        value,
      )
      if (!row) {
        res.status(404).json({ error: "Show segment not found" })
        return
      }
      res.json({ success: true })
    } catch (error) {
      console.error("Error updating show segment duration:", error)
      res.status(500).json({ error: "Failed to update segment duration" })
    }
  })

  // =========================================================================
  // Segments
  // =========================================================================

  router.get("/segments", async (req: Request, res: Response) => {
    try {
      const { search, status, tags, isRecurring, scheduled } = req.query
      const segments = await scheduling.findSegments({
        search: search as string | undefined,
        status: status as any,
        tags: tags ? (Array.isArray(tags) ? (tags as string[]) : [tags as string]) : undefined,
        isRecurring: isRecurring === undefined ? undefined : isRecurring === "true",
        scheduled: scheduled as any,
      })
      res.json({ segments })
    } catch (error) {
      console.error("Error listing segments:", error)
      res.status(500).json({ error: "Failed to list segments" })
    }
  })

  router.post("/segments", async (req: Request, res: Response) => {
    try {
      const createdBy = (req as any).platformUser?.id
      if (!createdBy) {
        res.status(401).json({ error: "Unauthorized" })
        return
      }
      const segment = await scheduling.createSegment(req.body, createdBy)
      res.status(201).json({ segment })
    } catch (error) {
      console.error("Error creating segment:", error)
      res.status(500).json({ error: "Failed to create segment" })
    }
  })

  router.get("/segments/:id", async (req: Request, res: Response) => {
    try {
      const segment = await scheduling.findSegmentById(req.params.id)
      if (!segment) {
        res.status(404).json({ error: "Segment not found" })
        return
      }
      res.json({ segment })
    } catch (error) {
      console.error("Error fetching segment:", error)
      res.status(500).json({ error: "Failed to fetch segment" })
    }
  })

  router.put("/segments/:id", async (req: Request, res: Response) => {
    try {
      const segment = await scheduling.updateSegment(req.params.id, req.body)
      if (!segment) {
        res.status(404).json({ error: "Segment not found" })
        return
      }
      res.json({ segment })
    } catch (error) {
      console.error("Error updating segment:", error)
      res.status(500).json({ error: "Failed to update segment" })
    }
  })

  router.delete("/segments/:id", async (req: Request, res: Response) => {
    try {
      const segment = await scheduling.deleteSegment(req.params.id)
      if (!segment) {
        res.status(404).json({ error: "Segment not found" })
        return
      }
      res.json({ success: true })
    } catch (error) {
      console.error("Error deleting segment:", error)
      res.status(500).json({ error: "Failed to delete segment" })
    }
  })

  // =========================================================================
  // Tags
  // =========================================================================

  router.get("/tags", async (req: Request, res: Response) => {
    try {
      const { type } = req.query
      const tags = await scheduling.findTags(type as TagType | undefined)
      res.json({ tags })
    } catch (error) {
      console.error("Error listing tags:", error)
      res.status(500).json({ error: "Failed to list tags" })
    }
  })

  router.post("/tags", async (req: Request, res: Response) => {
    try {
      const tag = await scheduling.createTag(req.body)
      res.status(201).json({ tag })
    } catch (error) {
      console.error("Error creating tag:", error)
      res.status(500).json({ error: "Failed to create tag" })
    }
  })

  router.delete("/tags/:id", async (req: Request, res: Response) => {
    try {
      const tag = await scheduling.deleteTag(req.params.id)
      if (!tag) {
        res.status(404).json({ error: "Tag not found" })
        return
      }
      res.json({ success: true })
    } catch (error) {
      console.error("Error deleting tag:", error)
      res.status(500).json({ error: "Failed to delete tag" })
    }
  })

  return router
}
