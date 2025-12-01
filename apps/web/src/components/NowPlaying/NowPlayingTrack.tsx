import { useMemo } from "react"
import { FiUser, FiSkipForward } from "react-icons/fi"
import { FaSpotify } from "react-icons/fa"
import {
  Heading,
  Text,
  HStack,
  LinkBox,
  LinkOverlay,
  VStack,
  Stack,
  Icon,
  Box,
  Tooltip,
  Badge,
} from "@chakra-ui/react"
import { format } from "date-fns"

import AlbumArtwork from "../AlbumArtwork"
import safeDate from "../../lib/safeDate"
import nullifyEmptyString from "../../lib/nullifyEmptyString"
import { User } from "../../types/User"
import { Room, RoomMeta } from "../../types/Room"
import { CountdownTimerProvider } from "../CountdownTimer"
import { NowPlayingVoteCountdown } from "../NowPlayingVoteCountdown"
import { PluginArea } from "../PluginComponents"

interface NowPlayingTrackProps {
  meta: RoomMeta
  room: Partial<Room> | null
  users: User[]
  timerEnabled: boolean
  timerSettings: {
    timeLimit: number
    reactionType: string
  }
}

function getCoverUrl(release: any, room: Partial<Room> | null): string | null {
  if (room?.artwork) {
    return room.artwork
  }

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

function getExternalUrl(release: any): string | null {
  return (
    (release as any)?.external_urls?.spotify ||
    release?.urls?.find((u: any) => u.type === "resource")?.url ||
    null
  )
}

export function NowPlayingTrack({
  meta,
  room,
  users,
  timerEnabled,
  timerSettings,
}: NowPlayingTrackProps) {
  const { album, artist, track, nowPlaying, title, dj } = meta
  const playedAt = nowPlaying?.playedAt
  const release = nowPlaying?.track

  const coverUrl = getCoverUrl(release, room)
  const externalUrl = getExternalUrl(release)
  const artworkSize = [24, "100%", "100%"]

  // Handle both old format (release_date) and new format (releaseDate)
  const releaseDate = (release?.album as any)?.release_date || release?.album?.releaseDate

  // Check if track was skipped by playlist-democracy plugin
  const isSkipped = nowPlaying?.pluginData?.["playlist-democracy"]?.skipped === true
  const skipData = nowPlaying?.pluginData?.["playlist-democracy"]?.skipData

  const djUsername = useMemo(
    () => (dj ? users.find(({ userId }) => userId === dj.userId)?.username ?? dj?.username : null),
    [users, dj],
  )

  const titleDisplay =
    nullifyEmptyString(track) ??
    nullifyEmptyString(title?.replace(/\|/g, "")) ??
    nullifyEmptyString(room?.title) ??
    null

  const addedAt = new Date(nowPlaying?.addedAt ?? 0).toString()

  return (
    <VStack align="start" spacing={4} w="100%">
      <LinkBox width="100%">
        <Stack direction={["row", "column"]} spacing={5} justify="center" flexGrow={1}>
          {coverUrl && (
            <Box
              position="relative"
              width={artworkSize}
              height={artworkSize}
              flex={{ shrink: 0, grow: 1 }}
            >
              <Box position="absolute">
                <PluginArea area="nowPlayingArt" />
              </Box>
              <AlbumArtwork coverUrl={coverUrl} />
            </Box>
          )}
          <VStack align="start" spacing={0}>
            <TrackTitle title={titleDisplay} externalUrl={externalUrl} isSkipped={isSkipped} />

            <SkippedBadge isSkipped={isSkipped} skipData={skipData} />

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

            <AddedByInfo dj={dj} djUsername={djUsername} addedAt={addedAt} />

            <PluginArea area="nowPlayingInfo" />

            <MetadataSourceInfo metadataSource={nowPlaying?.metadataSource} />
          </VStack>
        </Stack>
      </LinkBox>

      {timerEnabled && playedAt && (
        <HStack spacing={1}>
          <CountdownTimerProvider
            key={release?.id}
            start={playedAt}
            duration={timerSettings.timeLimit}
          >
            <NowPlayingVoteCountdown
              isSkipped={isSkipped}
              reactionType={timerSettings.reactionType}
            />
          </CountdownTimerProvider>
        </HStack>
      )}
    </VStack>
  )
}

// Sub-components

interface TrackTitleProps {
  title: string | null
  externalUrl: string | null
  isSkipped: boolean
}

function TrackTitle({ title, externalUrl, isSkipped }: TrackTitleProps) {
  const headingStyles = {
    color: "primaryBg",
    margin: "none",
    as: "h3" as const,
    size: ["md", "lg"] as any,
    textDecoration: isSkipped ? "line-through" : "none",
    opacity: isSkipped ? 0.7 : 1,
  }

  if (externalUrl) {
    return (
      <LinkOverlay href={externalUrl} isExternal>
        <Heading {...headingStyles}>{title}</Heading>
      </LinkOverlay>
    )
  }

  return <Heading {...headingStyles}>{title}</Heading>
}

interface SkippedBadgeProps {
  isSkipped: boolean
  skipData?: { voteCount: number; requiredCount: number }
}

function SkippedBadge({ isSkipped, skipData }: SkippedBadgeProps) {
  if (!isSkipped) return null

  return (
    <Tooltip
      label={
        skipData
          ? `Skipped: ${skipData.voteCount}/${skipData.requiredCount} votes`
          : "Skipped by Playlist Democracy"
      }
    >
      <Badge colorScheme="orange" variant="subtle" mt={1}>
        <HStack spacing={1}>
          <Icon as={FiSkipForward} boxSize={3} />
          <Text>Skipped</Text>
        </HStack>
      </Badge>
    </Tooltip>
  )
}

interface AddedByInfoProps {
  dj?: { userId: string; username?: string } | null
  djUsername: string | null
  addedAt: string
}

function AddedByInfo({ dj, djUsername, addedAt }: AddedByInfoProps) {
  if (!dj) return null

  return (
    <HStack mt={4} spacing={2}>
      <Icon color="primaryBg" boxSize={3} as={FiUser} />
      <Text as="i" color="primaryBg" fontSize="xs">
        Added by {djUsername} at {format(new Date(addedAt), "p")}
      </Text>
    </HStack>
  )
}

interface MetadataSourceInfoProps {
  metadataSource?: { type: string; trackId: string } | null
}

function MetadataSourceInfo({ metadataSource }: MetadataSourceInfoProps) {
  if (!metadataSource) return null

  return (
    <HStack spacing={1}>
      <Text as="span" color="primary.200" fontSize="2xs">
        Track data provided by
      </Text>
      <HStack spacing={1}>
        {metadataSource.type === "spotify" ? (
          <>
            <Icon as={FaSpotify} color="primary.200" boxSize={3} />
            <Text color="primary.200" fontSize="2xs" as="span">
              Spotify
            </Text>
          </>
        ) : (
          <Text color="primary.200" fontSize="2xs" as="span">
            {metadataSource.type}
          </Text>
        )}
      </HStack>
    </HStack>
  )
}
