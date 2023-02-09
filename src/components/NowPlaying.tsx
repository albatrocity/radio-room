import React, { useEffect, memo, useMemo } from "react"
import { FiMusic } from "react-icons/fi"
import {
  Box,
  Heading,
  Flex,
  Text,
  HStack,
  LinkBox,
  LinkOverlay,
  VStack,
  Icon,
  Hide,
} from "@chakra-ui/react"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import { TrackMeta } from "../types/Track"
import ButtonListeners from "./ButtonListeners"

interface NowPlayingProps {
  onCover: (showCover: boolean) => void
  offline: boolean
  meta: TrackMeta
  coverFound: boolean
}

const NowPlaying = ({
  onCover,
  offline,
  meta,
  coverFound,
}: NowPlayingProps) => {
  const {
    album,
    artist,
    track,
    release = { mbid: undefined, releaseDate: undefined },
    cover,
    title,
  } = meta || {}
  const { mbid, releaseDate } = release || {}
  const releaseUrl = mbid && `https://musicbrainz.org/release/${mbid}`
  const coverUrl = useMemo(
    () =>
      cover
        ? cover
        : mbid
        ? `https://coverartarchive.org/release/${mbid}/front-500`
        : null,
    [mbid, cover],
  )

  useEffect(() => {
    if (coverUrl) {
      onCover(true)
    } else {
      onCover(false)
    }
  }, [coverUrl])

  const artworkSize = [24, "120px", "220px"]

  return (
    <Box
      p={3}
      background="base"
      alignContent="center"
      alignItems="center"
      justifyContent="center"
    >
      {offline ? (
        <VStack>
          <Heading
            margin="none"
            as="h2"
            size="lg"
            color="white"
            textAlign="center"
          >
            Offline :(
          </Heading>
          <Hide above="sm">
            <ButtonListeners />
          </Hide>
        </VStack>
      ) : (
        <LinkBox>
          <HStack spacing={5} justify="center">
            {coverUrl && coverFound ? (
              <Box
                width={artworkSize}
                height={artworkSize}
                flex={{ shrink: 0, grow: 1 }}
              >
                <AlbumArtwork coverUrl={coverUrl} onCover={onCover} />
              </Box>
            ) : (
              <Flex
                background="primaryBg"
                width={artworkSize}
                height={artworkSize}
                align="center"
                justify="center"
                flex={{ shrink: 0, grow: 1 }}
              >
                <Icon as={FiMusic} boxSize={20} color="primary.500" />
              </Flex>
            )}
            <VStack align={"start"} spacing={0}>
              {(track || title) && (
                <LinkOverlay href={releaseUrl} target="_blank">
                  <Heading
                    color="primaryBg"
                    margin="none"
                    as="h3"
                    size={["md", "lg"]}
                  >
                    {track || title.replace(/\|/g, "")}
                  </Heading>
                </LinkOverlay>
              )}
              {artist && (
                <Heading color="primaryBg" margin="none" as="h4" size="sm">
                  {artist}
                </Heading>
              )}
              {album && (
                <Text as="span" color="primaryBg" margin="none" fontSize="xs">
                  {album}
                </Text>
              )}
              {releaseDate && (
                <Text as="span" color="primaryBg" fontSize="xs">
                  Released {safeDate(releaseDate)}
                </Text>
              )}
            </VStack>
          </HStack>
        </LinkBox>
      )}
    </Box>
  )
}

export default memo(NowPlaying)
