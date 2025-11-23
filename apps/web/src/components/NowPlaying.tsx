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
  Show,
  Spinner,
  Center,
} from "@chakra-ui/react"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import nullifyEmptyString from "../lib/nullifyEmptyString"
import ButtonAddToQueue from "./ButtonAddToQueue"
import { User } from "../types/User"
import { useUsers } from "../state/usersStore"
import { Room, RoomMeta } from "../types/Room"
import { SpotifyTrack } from "../types/SpotifyTrack"
import { useCurrentRoom, useRoomStore } from "../state/roomStore"
import { useIsAdmin } from "../state/authStore"
import { FaSpotify } from "react-icons/fa"
import Timestamp from "./Timestamp"
import { format } from "date-fns"

interface NowPlayingProps extends BoxProps {
  offline: boolean
  meta: RoomMeta
}

function getCoverUrl({
  release,
  room,
}: {
  release?: any // Can be SpotifyTrack or MetadataSourceTrack
  room?: Partial<Room> | null
}) {
  if (room?.artwork) {
    return room.artwork
  }
  // Handle both old Spotify format and new adapter format
  if (release?.album?.images?.length) {
    const firstImage = release.album.images[0]
    // New adapter format has { type, url, id }
    if (typeof firstImage === "object" && firstImage.url) {
      return firstImage.url
    }
    // Old Spotify format has direct URL
    if (typeof firstImage === "string") {
      return firstImage
    }
  }

  return null
}

const NowPlaying = ({ meta }: NowPlayingProps) => {
  const users: User[] = useUsers()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const { state } = useRoomStore()
  const { album, artist, track, nowPlaying, title, dj, stationMeta } = meta || {}

  console.log("meta ", meta)

  // Extract release from nowPlaying for backward compatibility
  const release = nowPlaying?.track

  const coverUrl = getCoverUrl({ release, room })
  const artworkSize = [24, "100%", "100%"]
  // Handle both old format (release_date) and new format (releaseDate)
  const releaseDate = (release?.album as any)?.release_date || release?.album?.releaseDate
  const lastUpdate = meta?.lastUpdatedAt

  // Determine if we have actual playback data
  // For jukebox rooms: check if there's no nowPlaying data at all
  // For radio rooms: we almost always have data (station broadcast), so check if track exists
  const hasNoPlaybackData = !meta.nowPlaying?.track

  const fetchedWithNoData =
    state.matches("success") && lastUpdate && hasNoPlaybackData && room?.fetchMeta
  const fetchedWithNoUpdate = state.matches("success") && !lastUpdate

  const djUsername = useMemo(
    () => (dj ? users.find(({ userId }) => userId === dj.userId)?.username ?? dj?.username : null),
    [users, dj],
  )

  const titleDisplay =
    nullifyEmptyString(track) ??
    nullifyEmptyString(title?.replace(/\|/g, "")) ??
    nullifyEmptyString(room?.title) ??
    null

  const addedAt = new Date(meta.nowPlaying?.addedAt ?? 0).toString()

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
      <VStack spacing={4} justify="space-between" height="100%" width="100%" className="outer">
        {state.matches("loading") && (
          <Center h="100%" w="100%">
            <Spinner />
          </Center>
        )}
        {fetchedWithNoUpdate && (
          <VStack className="getting">
            <Center h="100%" w="100%">
              <VStack spacing={4}>
                <Spinner />
                <Text>Getting Now Playing data...</Text>
              </VStack>
            </Center>
          </VStack>
        )}
        {fetchedWithNoData && (
          <VStack className="lastupdate">
            <VStack spacing={2} px={4} alignContent="flex-start" className="empty">
              <Heading w="100%" as="h2" size="lg" color="whiteAlpha.900" textAlign="left">
                Nothing is playing
              </Heading>
              {room?.type === "radio" ? (
                <Text color="whiteAlpha.900">
                  {isAdmin
                    ? "The radio station appears to be offline. Check your station URL in settings."
                    : "The radio station appears to be offline."}
                </Text>
              ) : isAdmin ? (
                <Text color="whiteAlpha.900">
                  There's no active device playing Spotify. Play something on your Spotify app and
                  check back here.
                </Text>
              ) : (
                <Text color="white">
                  The host isn't currently playing anything on their Spotify account.
                </Text>
              )}
            </VStack>
          </VStack>
        )}
        {state.matches("success") && release && (
          <VStack align="start" spacing={4} w="100%">
            <LinkBox width="100%">
              <Stack direction={["row", "column"]} spacing={5} justify="center" flexGrow={1}>
                {coverUrl && (
                  <Box width={artworkSize} height={artworkSize} flex={{ shrink: 0, grow: 1 }}>
                    <AlbumArtwork coverUrl={coverUrl} />
                  </Box>
                )}
                <VStack align={"start"} spacing={0}>
                  <>
                    {/* Handle both old Spotify format (external_urls.spotify) and new adapter format (urls array) */}
                    {(release as any)?.external_urls?.spotify ||
                    release?.urls?.find((u: any) => u.type === "resource")?.url ? (
                      <LinkOverlay
                        href={
                          (release as any)?.external_urls?.spotify ||
                          release?.urls?.find((u: any) => u.type === "resource")?.url
                        }
                        isExternal={true}
                      >
                        <Heading color="primaryBg" margin="none" as="h3" size={["md", "lg"]}>
                          {titleDisplay}
                        </Heading>
                      </LinkOverlay>
                    ) : (
                      <Heading color="primaryBg" margin="none" as="h3" size={["md", "lg"]}>
                        {titleDisplay}
                      </Heading>
                    )}
                  </>

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
                  {(releaseDate || release?.album?.releaseDate) && (
                    <Text as="span" color="primaryBg" fontSize="xs">
                      Released {safeDate(releaseDate || release?.album?.releaseDate)}
                    </Text>
                  )}
                  {dj && (
                    <HStack mt={4} spacing={2}>
                      <Icon color="primaryBg" boxSize={3} as={FiUser} />
                      <Text as="i" color="primaryBg" fontSize="xs">
                        Added by {djUsername} at {format(new Date(addedAt), "p")}
                      </Text>
                    </HStack>
                  )}
                  {meta.nowPlaying?.metadataSource && (
                    <HStack spacing={1}>
                      <Text as="span" color="primary.200" fontSize="2xs">
                        Track data provided by
                      </Text>
                      <HStack spacing={1}>
                        {meta.nowPlaying.metadataSource.type === "spotify" && (
                          <>
                            <Icon as={FaSpotify} color="primary.200" boxSize={3} />
                            <Text color="primary.200" fontSize="2xs" as="span">
                              Spotify
                            </Text>
                          </>
                        )}
                        {meta.nowPlaying.metadataSource.type !== "spotify" && (
                          <Text color="primary.200" fontSize="2xs" as="span">
                            {meta.nowPlaying.metadataSource.type}
                          </Text>
                        )}
                      </HStack>
                    </HStack>
                  )}
                </VStack>
              </Stack>
            </LinkBox>
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
