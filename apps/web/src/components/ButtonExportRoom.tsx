import { useState, useCallback } from "react"
import { Button, HStack, Text } from "@chakra-ui/react"
import { FaDownload, FaFileCode, FaFileAlt } from "react-icons/fa"

import { useCurrentRoom } from "../hooks/useActors"
import { exportRoom, downloadBlob, ExportFormat } from "../lib/serverApi"
import { toast } from "../lib/toasts"

interface Props {
  /** Size variant for the button */
  size?: "xs" | "sm" | "md" | "lg"
  /** Whether to show as icon-only button */
  iconOnly?: boolean
}

/**
 * Button to export room data in JSON or Markdown format.
 * Available to all users in a room.
 */
export default function ButtonExportRoom({ size = "sm", iconOnly = false }: Props) {
  const room = useCurrentRoom()
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("markdown")

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!room?.id) return

      setIsLoading(true)
      setSelectedFormat(format)

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
      }
    },
    [room?.id, room?.title],
  )

  if (!room) return null

  if (iconOnly) {
    return (
      <Button
        aria-label="Export room"
        size={size}
        variant="ghost"
        loading={isLoading}
        disabled={isLoading}
        onClick={() => handleExport(selectedFormat)}
      >
        <FaDownload />
      </Button>
    )
  }

  return (
    <HStack gap={1}>
      {!isOpen && (
        <Button onClick={() => setIsOpen(true)} size={size} variant="outline">
          Export Room
        </Button>
      )}

      {isOpen && (
        <HStack>
          <Button
            size={size}
            variant="ghost"
            loading={isLoading && selectedFormat === "markdown"}
            disabled={isLoading}
            onClick={() => handleExport("markdown")}
            title="Export as Markdown"
          >
            <FaFileAlt />
            <Text display={{ base: "none", md: "inline" }} ml={1}>
              Markdown
            </Text>
          </Button>
          <Button
            size={size}
            variant="ghost"
            loading={isLoading && selectedFormat === "json"}
            disabled={isLoading}
            onClick={() => handleExport("json")}
            title="Export as JSON"
          >
            <FaFileCode />
            <Text display={{ base: "none", md: "inline" }} ml={1}>
              JSON
            </Text>
          </Button>
          <Button size={size} onClick={() => setIsOpen(false)} variant="outline">
            Cancel
          </Button>
        </HStack>
      )}
    </HStack>
  )
}
