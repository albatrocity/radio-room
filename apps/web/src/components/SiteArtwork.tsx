import { Box, Image, Text } from "@chakra-ui/react"
import AppModelViewer from "./AppModelViewer"

type Props = {
  name: string
  /** Emoji icon from the trip map. */
  icon?: string
  imageUrl?: string
  /** GLB URL; present once the site is visited (D12a). */
  modelUrl?: string
}

function SiteImage({ src }: { src: string }) {
  return <Image src={src} alt="" w="full" maxH="220px" objectFit="cover" borderRadius="md" />
}

/**
 * Hero art for road-trip site detail (ADR 0205): the 3D stage once visited, otherwise the
 * image, otherwise nothing (the header already shows the icon). While the model loads, or
 * if it fails, the image or a large icon stands in.
 */
export default function SiteArtwork({ name, icon, imageUrl, modelUrl }: Props) {
  if (modelUrl) {
    const fallback = imageUrl ? (
      <SiteImage src={imageUrl} />
    ) : (
      <Text as="span" fontSize="6xl" lineHeight={1} aria-hidden>
        {icon}
      </Text>
    )
    return (
      <Box w="full" maxW="320px" mx="auto" borderRadius="md" overflow="hidden">
        <AppModelViewer key={modelUrl} src={modelUrl} alt={name} mode="stage" fallback={fallback} />
      </Box>
    )
  }
  if (imageUrl) return <SiteImage src={imageUrl} />
  return null
}
