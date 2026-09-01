import type { Ref } from "react"
import { HStack, Text, VStack } from "@chakra-ui/react"
import type { MetadataSourceTrackWithSource } from "@repo/types"
import type { TrackRoomPresence } from "../lib/trackRoomPresence"
import { SourceBadge } from "./SourceBadge"
import TrackItem from "./TrackItem"
import { TrackPresenceBadges } from "./TrackPresenceBadges"
import { TrackRowActions } from "./TrackRowActions"

export type TrackPreviewStatus = "idle" | "loading" | "playing"

type Props = {
  track: MetadataSourceTrackWithSource
  disabled?: boolean
  previewStatus: TrackPreviewStatus
  /** When false, the play control is omitted (e.g. Spotify/Tidal browse rows). */
  canPreview?: boolean
  onPreview: () => void
  onAddToQueue?: () => void
  /** browse/dialog row vs search hit (larger art). */
  size?: "row" | "track"
  /** When false, omit the leading cover (item detail / album browse track list). */
  showArtwork?: boolean
  /**
   * `full` — title/artists/album (default; TrackSearch).
   * `titleDuration` — title + duration under an album hero (CatalogBrowse tracks).
   */
  detailLevel?: "full" | "titleDuration"
  /** TrackSearch listbox option chrome — not a row click target. */
  isActive?: boolean
  optionId?: string
  role?: string
  "aria-selected"?: boolean
  onMouseEnter?: () => void
  rowRef?: Ref<HTMLDivElement>
  presence?: TrackRoomPresence
}

function TrackActionRow({
  track,
  disabled = false,
  previewStatus,
  canPreview = true,
  onPreview,
  onAddToQueue,
  size = "row",
  showArtwork = true,
  detailLevel = "full",
  isActive = false,
  optionId,
  role,
  "aria-selected": ariaSelected,
  onMouseEnter,
  rowRef,
  presence,
}: Props) {
  const previewLabel =
    previewStatus === "playing"
      ? `Stop preview of ${track.title}`
      : previewStatus === "loading"
      ? `Loading preview of ${track.title}`
      : `Preview ${track.title}`
  const compact = detailLevel === "titleDuration"

  return (
    <HStack
      ref={rowRef}
      id={optionId}
      role={role}
      aria-selected={ariaSelected}
      gap={4}
      w="100%"
      minW={0}
      p={2}
      borderRadius="md"
      align="flex-start"
      bg={isActive ? "actionBgLite" : undefined}
      onMouseEnter={onMouseEnter}
    >
      <HStack align="flex-start" gap={2} flex="1" minW={0} overflow="hidden">
        {!!track.trackNumber && compact ? (
          <Text fontSize="xs" color="fg.subtle" flexShrink={0}>
            {track.trackNumber}
          </Text>
        ) : null}
        <Box flex="1" minW={0} overflow="hidden">
          <TrackItem
            {...track}
            size={size}
            showArtwork={showArtwork}
            detailLevel={detailLevel}
            sourcePlacement={compact ? "none" : "below"}
          />
        </Box>
      </HStack>
      {!compact && track.source && <SourceBadge source={track.source} hideBelow="md" />}
      <VStack align="flex-end" gap={1} flexShrink={0}>
        <TrackRowActions
          previewStatus={previewStatus}
          canPreview={canPreview}
          previewLabel={previewLabel}
          disabled={disabled}
          addDisabled={presence?.inQueue}
          onPreview={onPreview}
          onAddToQueue={onAddToQueue}
        />
        {presence ? <TrackPresenceBadges presence={presence} /> : null}
      </VStack>
    </HStack>
  )
}

export default TrackActionRow
