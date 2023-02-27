import React, { memo, useMemo } from "react"
import { FiUser, FiMusic } from "react-icons/fi"
import { CgPlayListAdd } from "react-icons/cg"
import {
  BoxProps,
  Box,
  Heading,
  Flex,
  Text,
  HStack,
  LinkBox,
  LinkOverlay,
  VStack,
  Stack,
  Icon,
  Hide,
  Button,
  Show,
} from "@chakra-ui/react"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import { TrackMeta } from "../types/Track"
import ButtonListeners from "./ButtonListeners"
import useGlobalContext from "./useGlobalContext"
import { useActor } from "@xstate/react"
import useCanDj from "./useCanDj"

interface NowPlayingProps extends BoxProps {
  onCover: (showCover: boolean) => void
  offline: boolean
  meta: TrackMeta
  coverFound: boolean
}

const NowPlaying = ({ offline, meta }: NowPlayingProps) => {
  const globalServices = useGlobalContext()
  const [state] = useActor(globalServices.usersService)
  const users = state.context.users
  const {
    album,
    artist,
    track,
    release = { mbid: undefined, releaseDate: undefined },
    title,
    dj,
  } = meta || {}
  const djUsername = users.find(({ userId }) => userId === dj)?.username
  const canDj = useCanDj()

  const { mbid, releaseDate } = release || {}
  const releaseUrl = release?.url
    ? release.url
    : mbid && `https://musicbrainz.org/release/${mbid}`
  const coverUrl = useMemo(
    () =>
      release.artwork
        ? release.artwork
        : mbid
        ? `https://coverartarchive.org/release/${mbid}/front-500`
        : null,
    [mbid, release.artwork],
  )

  const artworkSize = [24, "100%", "100%"]

  return (
    <Box
      p={3}
      background="primary"
      alignContent="center"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      height="100%"
    >
      <VStack spacing={4} justify="space-between" height="100%">
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
            <Stack
              direction={["row", "column"]}
              spacing={5}
              justify="center"
              flexGrow={1}
            >
              {coverUrl ? (
                <Box
                  width={artworkSize}
                  height={artworkSize}
                  flex={{ shrink: 0, grow: 1 }}
                >
                  <AlbumArtwork coverUrl={coverUrl} />
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
                {dj && (
                  <HStack mt={4} spacing={2}>
                    <Icon color="primaryBg" boxSize={3} as={FiUser} />
                    <Text as="i" color="primaryBg" fontSize="xs">
                      Added by {djUsername}
                    </Text>
                  </HStack>
                )}
              </VStack>
            </Stack>
          </LinkBox>
        )}
        <Show above="sm">
          {canDj && (
            <Button
              leftIcon={<Icon as={CgPlayListAdd} />}
              onClick={() => globalServices.roomService.send("EDIT_QUEUE")}
            >
              Add to queue
            </Button>
          )}
        </Show>
      </VStack>
    </Box>
  )
}

export default memo(NowPlaying)
