import { Box, HStack, Image, Text, Badge } from "@chakra-ui/react"
import React from "react"
import type { ArtworkFrame } from "@repo/types"
import { labelForMetadataSource, MetadataSourceTrack } from "@repo/types"
import { toPhysicalMediaArt } from "../lib/physicalMediaArtwork"
import FramedArtwork from "./artworkFrames/FramedArtwork"
import { FRAMED_ARTWORK_TRACK_PX } from "./artworkFrames/frameStyles"

type TrackWithSource = MetadataSourceTrack & { source?: string }

type ArtworkOverride = {
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame
  name?: string
}

type Props = TrackWithSource & {
  /** When set (Physical Media item browse), show the sleeve instead of track album art. */
  artworkOverride?: ArtworkOverride
  /** Search hits use `"track"` (100px); drilled-in browse lists use `"row"` (40px). */
  size?: "row" | "track"
  /** When false, omit the leading cover (e.g. item detail track list under a hero sleeve). */
  showArtwork?: boolean
  /**
   * `full` — title, artists, album (default).
   * `titleDuration` — title + duration only (album-level browse under a hero).
   */
  detailLevel?: "full" | "titleDuration"
  /**
   * Where the metadata-source badge renders.
   * `inline` (default) sits beside the title; `below` stacks under album info
   * on small screens (parent should render a desktop-centered badge);
   * `none` omits it so a parent can place it.
   */
  sourcePlacement?: "inline" | "below" | "none"
}

const UNFRAMED_ROW_PX = 40

/** MetadataSourceTrack.duration is milliseconds. */
function formatTrackDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ""
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge size="sm" variant="subtle" flexShrink={0}>
      {labelForMetadataSource(source)}
    </Badge>
  )
}

const TrackItem = ({
  title,
  album,
  artists,
  source,
  duration,
  artworkOverride,
  size = "track",
  showArtwork = true,
  detailLevel = "full",
  sourcePlacement = "inline",
}: Props) => {
  const albumImage = album.images.find((img) => img.type === "image")
  const art = toPhysicalMediaArt(artworkOverride ?? {})
  const unframedPx = size === "row" ? UNFRAMED_ROW_PX : FRAMED_ARTWORK_TRACK_PX
  const durationLabel = formatTrackDuration(duration)

  const leadingVisual = (() => {
    if (!showArtwork) return null
    if (art) {
      return <FramedArtwork art={art} size={size} squareSlot alt="" />
    }
    if (artworkOverride?.imageUrl) {
      return (
        <Image
          w={`${unframedPx}px`}
          h={`${unframedPx}px`}
          flexShrink={0}
          src={artworkOverride.imageUrl}
          loading="lazy"
          alt=""
        />
      )
    }
    if (albumImage) {
      return (
        <Image
          w={`${unframedPx}px`}
          h={`${unframedPx}px`}
          flexShrink={0}
          src={albumImage.url}
          loading="lazy"
          alt=""
        />
      )
    }
    return null
  })()

  if (detailLevel === "titleDuration") {
    return (
      <HStack gap={2} w="100%" minW={0} align="flex-start">
        {leadingVisual}
        <Text
          fontWeight="medium"
          wordBreak="break-word"
          whiteSpace="normal"
          minW={0}
          flex="1"
          lineHeight="short"
        >
          {title}
        </Text>
        {durationLabel ? (
          <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" pt="0.1em">
            {durationLabel}
          </Text>
        ) : null}
      </HStack>
    )
  }

  return (
    <HStack gap={2} w="100%" minW={0} align="flex-start">
      {leadingVisual}
      <Box overflow="hidden" minW={0} flex="1">
        <HStack gap={2} align="flex-start" minW={0} justify="space-between">
          <Text fontWeight="bold" lineClamp={2} wordBreak="break-word" minW={0} flex="1">
            {title}
          </Text>
          {source && sourcePlacement === "inline" && <SourceBadge source={source} />}
        </HStack>
        <Text fontSize="sm" lineClamp={1} wordBreak="break-word">
          {artists.map((artist) => artist.title).join(", ")}
        </Text>
        <Text fontSize="xs" as="i" truncate>
          {album.title} {album.releaseDate ? `(${album.releaseDate.split("-")[0]})` : null}
        </Text>
        {source && sourcePlacement === "below" && (
          <Box mt={1} hideFrom="md">
            <SourceBadge source={source} />
          </Box>
        )}
      </Box>
    </HStack>
  )
}

export default TrackItem
