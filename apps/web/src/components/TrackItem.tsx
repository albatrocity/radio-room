import { Box, HStack, Image, Text } from "@chakra-ui/react"
import React from "react"
import { MetadataSourceTrack } from "@repo/types"

const TrackItem = ({ title, album, artists }: MetadataSourceTrack) => {
  // Find an image from the album images array
  const image = album.images.find((img) => img.type === "image")

  return (
    <HStack gap={2}>
      {image && <Image w={100} h={100} src={image.url} loading="lazy" />}
      <Box overflow="hidden">
        <Text fontWeight="bold">{title}</Text>
        <Text fontSize="sm">{artists.map((artist) => artist.title).join(", ")}</Text>
        <Text fontSize="xs" as="i" isTruncated>
          {album.title} {album.releaseDate ? `(${album.releaseDate.split("-")[0]})` : null}
        </Text>
      </Box>
    </HStack>
  )
}

export default TrackItem
