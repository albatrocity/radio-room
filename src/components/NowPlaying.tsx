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
} from "@chakra-ui/react"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import { TrackMeta } from "../types/Track"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import { User } from "../types/User"
import { useUsers } from "../state/usersStore"

interface NowPlayingProps extends BoxProps {
  offline: boolean
  meta: TrackMeta
}

function getCoverUrl(release: any, meta: TrackMeta, mbid?: string) {
  if (meta?.artwork) {
    return meta.artwork
  }
  if (release.artwork) {
    return release.artwork
  }
  if (mbid) {
    return `https://coverartarchive.org/release/${mbid}/front-500`
  }
  return null
}

const NowPlaying = ({ offline, meta }: NowPlayingProps) => {
  const users: User[] = useUsers()
  const {
    album,
    artist,
    track,
    release = { mbid: undefined, releaseDate: undefined },
    title,
    dj,
  } = meta || {}

  const djUsername = useMemo(
    () =>
      dj
        ? users.find(({ userId }) => userId === dj.userId)?.username ??
          dj?.username
        : null,
    [users, dj],
  )

  const { mbid, releaseDate } = release || {}
  const releaseUrl = release?.url
    ? release.url
    : mbid && `https://musicbrainz.org/release/${mbid}`

  const coverUrl = getCoverUrl(release, meta, mbid)

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
      <VStack spacing={4} justify="space-between" height="100%" width="100%">
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
                    {releaseUrl ? (
                      <LinkOverlay href={releaseUrl} isExternal={true}>
                        <Heading
                          color="primaryBg"
                          margin="none"
                          as="h3"
                          size={["md", "lg"]}
                        >
                          {track || title.replace(/\|/g, "")}
                        </Heading>
                      </LinkOverlay>
                    ) : (
                      <Heading
                        color="primaryBg"
                        margin="none"
                        as="h3"
                        size={["md", "lg"]}
                      >
                        {track || title.replace(/\|/g, "")}
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
          <ButtonAddToQueue />
        </Show>
      </VStack>
    </Box>
  )
}

export default memo(NowPlaying)
