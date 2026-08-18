import { Box, HStack, Image, Text, Badge } from "@chakra-ui/react"
import React from "react"
import type { ArtworkFrame } from "@repo/types"
import { labelForMetadataSource, MetadataSourceTrack } from "@repo/types"
import { toPhysicalMediaArt } from "../lib/physicalMediaArtwork"
import FramedArtwork from "./artworkFrames/FramedArtwork"

type TrackWithSource = MetadataSourceTrack & { source?: string }

type ArtworkOverride = {
  imageUrl: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame
}

type Props = TrackWithSource & {
  /** When set (Physical Media shelf browse), show the sleeve instead of track album art. */
  artworkOverride?: ArtworkOverride
}

const TrackItem = ({ title, album, artists, source, artworkOverride }: Props) => {
  const albumImage = album.images.find((img) => img.type === "image")
  const art = toPhysicalMediaArt(artworkOverride ?? {})

  const leadingVisual = (() => {
    if (art) {
      return <FramedArtwork art={art} size="track" squareSlot alt="" />
    }
    if (artworkOverride?.imageUrl) {
      return (
        <Image
          w={100}
          h={100}
          flexShrink={0}
          src={artworkOverride.imageUrl}
          loading="lazy"
          alt=""
        />
      )
    }
    if (albumImage) {
      return (
        <Image w={100} h={100} flexShrink={0} src={albumImage.url} loading="lazy" alt="" />
      )
    }
    return null
  })()

  return (
    <HStack gap={2} w="100%" minW={0} align="flex-start">
      {leadingVisual}
      <Box overflow="hidden" minW={0} flex="1">
        <HStack gap={2} align="flex-start" minW={0} justify="space-between">
          <Text fontWeight="bold" lineClamp={2} wordBreak="break-word" minW={0} flex="1">
            {title}
          </Text>
          {source && (
            <Badge size="sm" variant="subtle" flexShrink={0}>
              {labelForMetadataSource(source)}
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
