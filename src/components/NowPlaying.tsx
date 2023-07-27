import React, { memo, useMemo } from "react"
import { FiUser } from "react-icons/fi"
import {
  BoxProps,
  Box,
  Heading,
  Text,
  HStack,
  LinkBox,
  LinkOverlay,
  VStack,
  Stack,
  Icon,
  Hide,
  Show,
  Spinner,
  Center,
} from "@chakra-ui/react"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import { User } from "../types/User"
import { useUsers } from "../state/usersStore"
import { Room, RoomMeta } from "../types/Room"
import { SpotifyTrack } from "../types/SpotifyTrack"
import { useCurrentRoom, useRoomStore } from "../state/roomStore"
import { InfoIcon } from "@chakra-ui/icons"
import { useIsAdmin } from "../state/authStore"

interface NowPlayingProps extends BoxProps {
  offline: boolean
  meta: RoomMeta
}

function getCoverUrl({
  release,
  room,
}: {
  release?: SpotifyTrack
  room?: Partial<Room> | null
}) {
  if (room?.artwork) {
    return room.artwork
  }
  if (release?.album?.images.length) {
    return release?.album.images[0]?.url
  }

  return null
}

const NowPlaying = ({ meta }: NowPlayingProps) => {
  const users: User[] = useUsers()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const { state } = useRoomStore()
  const { album, artist, track, release, title, dj, stationMeta } = meta || {}

  const coverUrl = getCoverUrl({ release, room })
  const artworkSize = [24, "100%", "100%"]
  const releaseDate = release?.album?.release_date
  const lastUpdate = meta?.lastUpdatedAt

  const djUsername = useMemo(
    () =>
      dj
        ? users.find(({ userId }) => userId === dj.userId)?.username ??
          dj?.username
        : null,
    [users, dj],
  )

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
      <VStack spacing={4} justify="space-between" height="100%" width="100%">
        {state.matches("loading") && (
          <Center h="100%" w="100%">
            <Spinner />
          </Center>
        )}
        {state.matches("success") && !meta.release?.uri && (
          <VStack>
            {lastUpdate ? (
              <VStack spacing={2} px={4} alignContent="flex-start">
                <Heading
                  w="100%"
                  as="h2"
                  size="lg"
                  color="whiteAlpha.900"
                  textAlign="left"
                >
                  Nothing is playing
                </Heading>
                {isAdmin ? (
                  <Text color="whiteAlpha.900">
                    There's no active device playing Spotify. Pick something to
                    play from your Spotify app and check back here.
                  </Text>
                ) : (
                  <Text color="white">
                    The host isn't currently playing anything on their Spotify
                    account.
                  </Text>
                )}
              </VStack>
            ) : (
              <Center h="100%" w="100%">
                <VStack spacing={4}>
                  <Spinner />
                  <Text>Getting your Spotify data...</Text>
                </VStack>
              </Center>
            )}
            <Hide above="sm">
              <ButtonListeners />
            </Hide>
          </VStack>
        )}
        {state.matches("success") && meta.release && (
          <VStack align="start" spacing={4}>
            <LinkBox width="100%">
              <Stack
                direction={["row", "column"]}
                spacing={5}
                justify="center"
                flexGrow={1}
              >
                {coverUrl && (
                  <Box
                    width={artworkSize}
                    height={artworkSize}
                    flex={{ shrink: 0, grow: 1 }}
                  >
                    <AlbumArtwork coverUrl={coverUrl} />
                  </Box>
                )}
                <VStack align={"start"} spacing={0}>
                  {(track || title) && (
                    <>
                      {release?.external_urls?.spotify ? (
                        <LinkOverlay
                          href={release.external_urls.spotify}
                          isExternal={true}
                        >
                          <Heading
                            color="primaryBg"
                            margin="none"
                            as="h3"
                            size={["md", "lg"]}
                          >
                            {track ?? title?.replace(/\|/g, "")}
                          </Heading>
                        </LinkOverlay>
                      ) : (
                        <Heading
                          color="primaryBg"
                          margin="none"
                          as="h3"
                          size={["md", "lg"]}
                        >
                          {track ?? title?.replace(/\|/g, "")}
                        </Heading>
                      )}
                    </>
                  )}
                  {artist && (
                    <Heading color="primaryBg" margin="none" as="h4" size="sm">
                      {artist}
                    </Heading>
                  )}
                  {album && (
                    <Text
                      as="span"
                      color="primaryBg"
                      margin="none"
                      fontSize="xs"
                    >
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
            {stationMeta?.title && (
              <HStack spacing={2}>
                <InfoIcon color="primaryBg" boxSize={3} />
                <Text color="primaryBg" fontSize="xs" lineHeight={1}>
                  Based on a Spotify search for{" "}
                  <Text as="span" fontWeight={500} fontStyle="italic">
                    {stationMeta.title}
                  </Text>
                </Text>
              </HStack>
            )}
          </VStack>
        )}
        <Show above="sm">
          <ButtonAddToQueue variant="solid" />
        </Show>
      </VStack>
    </Box>
  )
}

export default memo(NowPlaying)
