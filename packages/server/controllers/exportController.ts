import { Request, Response } from "express"
import { exportFormatSchema } from "@repo/types"
import { ExportService } from "../services/ExportService"
import { findRoom } from "../operations/data"

/**
 * Export room data in JSON or Markdown format.
 *
 * GET /api/rooms/:roomId/export?format=json|markdown
 */
export async function exportRoom(req: Request, res: Response) {
  const { roomId } = req.params
  const formatParam = (req.query.format as string) || "json"
  const { context } = req

  // Validate format parameter
  const formatResult = exportFormatSchema.safeParse(formatParam)
  if (!formatResult.success) {
    res.status(400).json({
      error: "Invalid format parameter. Must be 'json' or 'markdown'.",
    })
    return
  }
  const format = formatResult.data

  // Check room exists
  const room = await findRoom({ context, roomId })
  if (!room) {
    res.status(404).json({ error: "Room not found" })
    return
  }

  try {
    const exportService = new ExportService(context)
    const exportData = await exportService.exportRoom(roomId, format)

    // Set appropriate headers based on format
    const filename = generateFilename(room.title, format)

    if (format === "markdown") {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    }

    res.send(exportData)
  } catch (error) {
    console.error("[ExportController] Error exporting room:", error)
    res.status(500).json({
      error: "Failed to export room data",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

/**
 * Generate a safe filename for the export.
 */
function generateFilename(roomTitle: string, format: "json" | "markdown"): string {
  // Sanitize room title for filename
  const safeName =
    roomTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "room"

  const date = new Date().toISOString().split("T")[0]
  const extension = format === "markdown" ? "md" : "json"

  return `${safeName}-export-${date}.${extension}`
}
