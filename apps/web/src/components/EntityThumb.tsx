import { Box, Image } from "@chakra-ui/react"
import type { ArtworkFrame, MetadataSourceUrl } from "@repo/types"
import FramedArtwork from "./artworkFrames/FramedArtwork"

const ENTITY_THUMB_SIZE = 40

function firstImageUrl(images?: MetadataSourceUrl[]): string | undefined {
  return images?.find((img) => img.type === "image")?.url
}

type Props = {
  images?: MetadataSourceUrl[]
  shape: "circle" | "square"
  alt?: string
  artworkFrame?: ArtworkFrame
  /** Chakra box size when framed (Physical Media). Defaults to 12. */
  boxSize?: number
}

/** Leading artwork for artist/album list rows (circle for artists, square for albums). */
export default function EntityThumb({
  images,
  shape,
  alt = "",
  artworkFrame,
  boxSize,
}: Props) {
  const url = firstImageUrl(images)
  const framedSize = boxSize ?? 12
  const radius = artworkFrame ? 0 : shape === "circle" ? "full" : "sm"
  const pixelSize = artworkFrame ? undefined : ENTITY_THUMB_SIZE

  if (url && artworkFrame) {
    return (
      <FramedArtwork
        imageUrl={url}
        artworkFrame={artworkFrame}
        boxSize={framedSize}
        alt={alt}
      />
    )
  }

  if (!url) {
    return (
      <Box
        w={pixelSize != null ? `${pixelSize}px` : undefined}
        h={pixelSize != null ? `${pixelSize}px` : undefined}
        boxSize={pixelSize == null ? framedSize : undefined}
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
      w={`${ENTITY_THUMB_SIZE}px`}
      h={`${ENTITY_THUMB_SIZE}px`}
      flexShrink={0}
      borderRadius={radius}
      objectFit="cover"
      loading="lazy"
    />
  )
}
