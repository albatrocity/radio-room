import { Box, HStack, Image, Text } from "@chakra-ui/react"
import React from "react"
import { SpotifyTrack } from "../types/SpotifyTrack"

const ItemSpotifyTrack = ({ name, album, artists }: SpotifyTrack) => {
  const smallImage = album.images.find(({ width }) => width < 500)
  return (
    <HStack spacing={2} cursor="pointer">
      {smallImage && <Image w={100} src={smallImage.url} />}
      <Box overflow="hidden">
        <Text fontWeight="bold">{name}</Text>
        <Text fontSize="sm">{artists.map(({ name }) => name).join(", ")}</Text>
        <Text fontSize="xs" as="i" isTruncated>
          {album.name}{" "}
          {album.release_date ? `(${album.release_date.split("-")[0]})` : null}
        </Text>
      </Box>
    </HStack>
  )
}

export default ItemSpotifyTrack
