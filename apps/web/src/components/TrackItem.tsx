import { Box, HStack, Image, Text, Badge } from "@chakra-ui/react"
import React from "react"
import { MetadataSourceTrack } from "@repo/types"

type TrackWithSource = MetadataSourceTrack & { source?: string }

const SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Library",
}

const TrackItem = ({ title, album, artists, source }: TrackWithSource) => {
  const image = album.images.find((img) => img.type === "image")

  return (
    <HStack gap={2} w="100%" minW={0} align="flex-start">
      {image && <Image w={100} h={100} flexShrink={0} src={image.url} loading="lazy" />}
      <Box overflow="hidden" minW={0} flex="1">
        <HStack gap={2} align="flex-start" minW={0} justify="space-between">
          <Text fontWeight="bold" lineClamp={2} wordBreak="break-word" minW={0} flex="1">
            {title}
          </Text>
          {source && (
            <Badge size="sm" variant="subtle" flexShrink={0}>
              {SOURCE_LABELS[source] ?? source}
            </Badge>
          )}
        </HStack>
        <Text fontSize="sm" lineClamp={1} wordBreak="break-word">
          {artists.map((artist) => artist.title).join(", ")}
        </Text>
        <Text fontSize="xs" as="i" truncate>
          {album.title} {album.releaseDate ? `(${album.releaseDate.split("-")[0]})` : null}
        </Text>
      </Box>
    </HStack>
  )
}

export default TrackItem
