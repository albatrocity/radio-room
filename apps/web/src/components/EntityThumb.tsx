import { Box, Image } from "@chakra-ui/react"
import type { ArtworkFrame, MediaCondition, MetadataSourceUrl } from "@repo/types"
import { firstImageUrl } from "../lib/metadataImages"
import { toPhysicalMediaArt } from "../lib/physicalMediaArtwork"
import FramedArtwork from "./artworkFrames/FramedArtwork"
import { FRAMED_ARTWORK_TRACK_PX } from "./artworkFrames/frameStyles"

const ENTITY_THUMB_ROW_PX = 40

type Props = {
  images?: MetadataSourceUrl[]
  shape: "circle" | "square"
  alt?: string
  artworkFrame?: ArtworkFrame
  /** Wear on this copy; drives crack/scuff/dent on the frame (ADR 0157). */
  condition?: MediaCondition
  /** Grouping rows use `"track"` (100px); compact rows use `"row"` (40px). */
  size?: "row" | "track"
}

/** Leading artwork for artist/album list rows (circle for artists, square for albums). */
export default function EntityThumb({
  images,
  shape,
  alt = "",
  artworkFrame,
  condition,
  size = "row",
}: Props) {
  const url = firstImageUrl(images)
  const radius = artworkFrame ? 0 : shape === "circle" ? "full" : 0
  const unframedPx = size === "track" ? FRAMED_ARTWORK_TRACK_PX : ENTITY_THUMB_ROW_PX
  const art = toPhysicalMediaArt({ imageUrl: url, artworkFrame, condition, name: alt })

  if (art) {
    return <FramedArtwork art={art} size={size} squareSlot alt={alt} />
  }

  if (!url) {
    return (
      <Box
        w={`${unframedPx}px`}
        h={`${unframedPx}px`}
        flexShrink={0}
        borderRadius={radius}
        bg="bg.muted"
        aria-hidden
      />
    )
  }

  return (
    <Image
      src={url}
      alt={alt}
      w={`${unframedPx}px`}
      h={`${unframedPx}px`}
      flexShrink={0}
      borderRadius={radius}
      objectFit="cover"
      loading="lazy"
    />
  )
}
