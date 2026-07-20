import { Box, HStack, Image, Text, Badge } from "@chakra-ui/react"
import React from "react"
import { MetadataSourceTrack } from "@repo/types"

type TrackWithSource = MetadataSourceTrack & { source?: string }

const SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Local",
}

const TrackItem = ({ title, album, artists, source }: TrackWithSource) => {
  const image = album.images.find((img) => img.type === "image")

  return (
    <HStack gap={2}>
      {image && <Image w={100} h={100} src={image.url} loading="lazy" />}
      <Box overflow="hidden">
        <HStack gap={2}>
          <Text fontWeight="bold">{title}</Text>
          {source && (
            <Badge size="sm" variant="subtle">
              {SOURCE_LABELS[source] ?? source}
            </Badge>
          )}
        </HStack>
        <Text fontSize="sm">{artists.map((artist) => artist.title).join(", ")}</Text>
        <Text fontSize="xs" as="i" truncate>
          {album.title} {album.releaseDate ? `(${album.releaseDate.split("-")[0]})` : null}
        </Text>
      </Box>
    </HStack>
  )
}

export default TrackItem
