import { Button, HStack, IconButton, Spinner } from "@chakra-ui/react"
import { getIcon } from "./PluginComponents/icons"
import { SvgIcon } from "./ui/svg-icon"
import type { TrackPreviewStatus } from "./TrackActionRow"

const PlayIcon = getIcon("Play")
const StopIcon = getIcon("Square")
const AddIcon = getIcon("ListPlus")

type Props = {
  previewStatus: TrackPreviewStatus
  canPreview?: boolean
  previewLabel: string
  disabled?: boolean
  onPreview: () => void
  onAddToQueue?: () => void
}

/**
 * Play + Add controls for track result rows (~44px tap targets on mobile).
 */
export function TrackRowActions({
  previewStatus,
  canPreview = true,
  previewLabel,
  disabled = false,
  onPreview,
  onAddToQueue,
}: Props) {
  return (
    <HStack gap={1} flexShrink={0} align="center">
      {canPreview && (
        <IconButton
          size={{ base: "sm", md: "xs" }}
          minH={{ base: "11", md: undefined }}
          minW={{ base: "11", md: undefined }}
          variant={previewStatus === "playing" ? "solid" : "ghost"}
          colorPalette="action"
          aria-label={previewLabel}
          title={previewLabel}
          disabled={disabled || previewStatus === "loading"}
          onClick={onPreview}
        >
          {previewStatus === "loading" ? (
            <Spinner size="sm" />
          ) : previewStatus === "playing" && StopIcon ? (
            <SvgIcon icon={StopIcon} boxSize={{ base: "1rem", md: "0.85rem" }} />
          ) : PlayIcon ? (
            <SvgIcon icon={PlayIcon} boxSize={{ base: "1rem", md: "0.85rem" }} />
          ) : (
            "Play"
          )}
        </IconButton>
      )}
      {onAddToQueue && (
        <Button
          size={{ base: "sm", md: "xs" }}
          minH={{ base: "11", md: undefined }}
          variant="outline"
          colorPalette="action"
          disabled={disabled}
          onClick={onAddToQueue}
        >
          {AddIcon && <SvgIcon icon={AddIcon} boxSize={{ base: "1rem", md: "0.85rem" }} />}
          Add
        </Button>
      )}
    </HStack>
  )
}
