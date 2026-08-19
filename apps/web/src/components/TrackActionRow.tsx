import type { Ref } from "react"
import { Badge, HStack } from "@chakra-ui/react"
import { labelForMetadataSource, type ArtworkFrame, type MetadataSourceTrack } from "@repo/types"
import TrackItem from "./TrackItem"
import { TrackRowActions } from "./TrackRowActions"

type TrackWithSource = MetadataSourceTrack & { source?: string }

type ArtworkOverride = {
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame
  name?: string
}

export type TrackPreviewStatus = "idle" | "loading" | "playing"

type Props = {
  track: TrackWithSource
  artworkOverride?: ArtworkOverride
  disabled?: boolean
  previewStatus: TrackPreviewStatus
  /** When false, the play control is omitted (e.g. Spotify/Tidal browse rows). */
  canPreview?: boolean
  onPreview: () => void
  onAddToQueue?: () => void
  /** browse/dialog row vs search hit (larger art). */
  size?: "row" | "track"
  /** TrackSearch listbox option chrome — not a row click target. */
  isActive?: boolean
  optionId?: string
  role?: string
  "aria-selected"?: boolean
  onMouseEnter?: () => void
  rowRef?: Ref<HTMLDivElement>
}

function TrackActionRow({
  track,
  artworkOverride,
  disabled = false,
  previewStatus,
  canPreview = true,
  onPreview,
  onAddToQueue,
  size = "row",
  isActive = false,
  optionId,
  role,
  "aria-selected": ariaSelected,
  onMouseEnter,
  rowRef,
}: Props) {
  const previewLabel =
    previewStatus === "playing"
      ? `Stop preview of ${track.title}`
      : previewStatus === "loading"
        ? `Loading preview of ${track.title}`
        : `Preview ${track.title}`

  return (
    <HStack
      ref={rowRef}
      id={optionId}
      role={role}
      aria-selected={ariaSelected}
      gap={2}
      w="100%"
      minW={0}
      p={2}
      borderRadius="md"
      align="center"
      bg={isActive ? "actionBgLite" : undefined}
      onMouseEnter={onMouseEnter}
    >
      <TrackItem
        {...track}
        size={size}
        artworkOverride={artworkOverride}
        sourcePlacement="below"
      />
      {track.source && (
        <Badge size="sm" variant="subtle" flexShrink={0} hideBelow="md">
          {labelForMetadataSource(track.source)}
        </Badge>
      )}
      <TrackRowActions
        previewStatus={previewStatus}
        canPreview={canPreview}
        previewLabel={previewLabel}
        disabled={disabled}
        onPreview={onPreview}
        onAddToQueue={onAddToQueue}
      />
    </HStack>
  )
}

export default TrackActionRow
