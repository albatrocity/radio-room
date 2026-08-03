import { Box, Image } from "@chakra-ui/react"
import type { MetadataSourceUrl } from "@repo/types"

const ENTITY_THUMB_SIZE = 40

function firstImageUrl(images?: MetadataSourceUrl[]): string | undefined {
  return images?.find((img) => img.type === "image")?.url
}

type Props = {
  images?: MetadataSourceUrl[]
  shape: "circle" | "square"
  alt?: string
}

/** Leading artwork for artist/album list rows (circle for artists, square for albums). */
export default function EntityThumb({ images, shape, alt = "" }: Props) {
  const url = firstImageUrl(images)
  const radius = shape === "circle" ? "full" : "sm"
  if (!url) {
    return (
      <Box
        w={`${ENTITY_THUMB_SIZE}px`}
        h={`${ENTITY_THUMB_SIZE}px`}
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
