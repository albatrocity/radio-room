import { useState, useCallback } from "react"
import { IconButton, Menu, Portal, Spinner } from "@chakra-ui/react"
import { FaDownload, FaFileCode, FaFileAlt } from "react-icons/fa"
import { Tooltip } from "./ui/tooltip"

import { useCurrentRoom } from "../hooks/useActors"
import { exportRoom, downloadBlob, ExportFormat } from "../lib/serverApi"
import { toast } from "../lib/toasts"

interface Props {
  /** Size variant for the button */
  size?: "xs" | "sm" | "md" | "lg"
}

/**
 * IconButton with menu to export room data in JSON or Markdown format.
 * Available to all users in a room.
 */
export default function ButtonExportRoom({ size = "sm" }: Props) {
  const room = useCurrentRoom()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null)

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!room?.id) return

      setIsLoading(true)
      setLoadingFormat(format)

      try {
        const blob = await exportRoom(room.id, format)

        // Generate filename
        const safeName =
          room.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 50) || "room"
        const date = new Date().toISOString().split("T")[0]
        const extension = format === "markdown" ? "md" : "json"
        const filename = `${safeName}-export-${date}.${extension}`

        downloadBlob(blob, filename)

        toast({
          title: "Export complete",
          description: `Room data exported as ${format.toUpperCase()}`,
          type: "success",
          duration: 3000,
        })
      } catch (error) {
        console.error("Export failed:", error)
        toast({
          title: "Export failed",
          description: error instanceof Error ? error.message : "Failed to export room data",
          type: "error",
          duration: 5000,
        })
      } finally {
        setIsLoading(false)
        setLoadingFormat(null)
      }
    },
    [room?.id, room?.title],
  )

  if (!room) return null

  return (
    <Tooltip content="Export room data" showArrow>
      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton aria-label="Export room" size={size} variant="ghost" disabled={isLoading}>
            {isLoading ? <Spinner size="sm" /> : <FaDownload />}
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner style={{ zIndex: 2000 }}>
            <Menu.Content>
              <Menu.Item
                value="markdown"
                onClick={() => handleExport("markdown")}
                disabled={isLoading}
              >
                {loadingFormat === "markdown" ? <Spinner size="sm" /> : <FaFileAlt />}
                Markdown
              </Menu.Item>
              <Menu.Item value="json" onClick={() => handleExport("json")} disabled={isLoading}>
                {loadingFormat === "json" ? <Spinner size="sm" /> : <FaFileCode />}
                JSON
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Tooltip>
  )
}
