import { useMemo } from "react"
import { FiUser } from "react-icons/fi"
import { FaSpotify } from "react-icons/fa"
import { SiTidal } from "react-icons/si"
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
} from "@chakra-ui/react"
import { format } from "date-fns"

import AlbumArtwork from "../AlbumArtwork"
import safeDate from "../../lib/safeDate"
import nullifyEmptyString from "../../lib/nullifyEmptyString"
import { User } from "../../types/User"
import { Room, RoomMeta } from "../../types/Room"
import { PluginArea } from "../PluginComponents"
import { usePluginStyles } from "../../hooks/usePluginStyles"
import { usePreferredMetadataSource } from "../../hooks/useActors"
import { MetadataSourceType } from "../../types/Queue"

interface NowPlayingTrackProps {
  meta: RoomMeta
  room: Partial<Room> | null
  users: User[]
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

/**
 * Get the track data for the user's preferred metadata source,
 * falling back to the default track data if preferred source isn't available
 */
function getPreferredTrackData(
  nowPlaying: RoomMeta["nowPlaying"],
  preferredSource: MetadataSourceType | undefined,
) {
  // If we have a preference and the data is available, use it
  if (preferredSource && nowPlaying?.metadataSources?.[preferredSource]) {
    return {
      track: nowPlaying.metadataSources[preferredSource]!.track,
      metadataSource: nowPlaying.metadataSources[preferredSource]!.source,
    }
  }

  // Fall back to default track data
  return {
    track: nowPlaying?.track,
    metadataSource: nowPlaying?.metadataSource,
  }
}

export function NowPlayingTrack({ meta, room, users }: NowPlayingTrackProps) {
  const { album, artist, track, nowPlaying, title, dj } = meta
  const preferredSource = usePreferredMetadataSource()

  // Get track data based on user's preference
  const { track: preferredTrack, metadataSource: activeMetadataSource } = useMemo(
    () => getPreferredTrackData(nowPlaying, preferredSource),
    [nowPlaying, preferredSource],
  )

  // Use preferred track data if available, otherwise fall back to default
  const release = preferredTrack || nowPlaying?.track

  const coverUrl = getCoverUrl(release, room)
  const externalUrl = getExternalUrl(release)
  const artworkSize = [24, "100%", "100%"]

  // Handle both old format (release_date) and new format (releaseDate)
  const releaseDate = (release?.album as any)?.release_date || release?.album?.releaseDate

  // Get plugin-provided styles for the title
  const titleStyles = usePluginStyles(nowPlaying?.pluginData, "title")

  const djUsername = useMemo(
    () =>
      dj
        ? users.find(({ userId }) => userId === dj.userId)?.username ?? dj?.username ?? null
        : null,
    [users, dj],
  )

  const titleDisplay =
    nullifyEmptyString(track) ??
    nullifyEmptyString(title?.replace(/\|/g, "")) ??
    nullifyEmptyString(room?.title) ??
    null

  const addedAt = new Date(nowPlaying?.addedAt ?? 0).toString()

  return (
    <VStack align="start" gap={4} w="100%">
      <LinkBox width="100%">
        <Stack direction={["row", "column"]} gap={5} justify="center" flexGrow={1}>
          {coverUrl && (
            <Box position="relative" width={artworkSize} height={artworkSize}>
              <Box position="absolute">
                <PluginArea area="nowPlayingArt" color="primaryBg" />
              </Box>
              <AlbumArtwork coverUrl={coverUrl} />
            </Box>
          )}
          <VStack align="start" gap={0}>
            <TrackTitle title={titleDisplay} externalUrl={externalUrl} pluginStyles={titleStyles} />

            <PluginArea area="nowPlayingBadge" />

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

            <PluginArea area="nowPlayingInfo" color="primaryBg" />

            <MetadataSourceInfo metadataSource={activeMetadataSource} />
          </VStack>
        </Stack>
      </LinkBox>
    </VStack>
  )
}

// Sub-components

interface TrackTitleProps {
  title: string | null
  externalUrl: string | null
  pluginStyles: React.CSSProperties
}

function TrackTitle({ title, externalUrl, pluginStyles }: TrackTitleProps) {
  const headingStyles = {
    color: "primaryBg",
    margin: "none",
    as: "h3" as const,
    size: ["md", "lg"] as any,
  }

  if (externalUrl) {
    return (
      <LinkOverlay href={externalUrl} target="_blank" rel="noopener noreferrer">
        <Heading {...headingStyles} style={pluginStyles}>
          {title}
        </Heading>
      </LinkOverlay>
    )
  }

  return (
    <Heading {...headingStyles} style={pluginStyles}>
      {title}
    </Heading>
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
    <HStack mt={4} gap={2}>
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

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "spotify":
        return FaSpotify
      case "tidal":
        return SiTidal
      default:
        return null
    }
  }

  const getSourceName = (type: string) => {
    switch (type) {
      case "spotify":
        return "Spotify"
      case "tidal":
        return "Tidal"
      default:
        return type
    }
  }

  const SourceIcon = getSourceIcon(metadataSource.type)

  return (
    <HStack gap={1}>
      <Text as="span" color="primary.200" fontSize="2xs">
        Track data provided by
      </Text>
      <HStack gap={1}>
        {SourceIcon && <Icon as={SourceIcon} color="primary.200" boxSize={3} />}
        <Text color="primary.200" fontSize="2xs" as="span">
          {getSourceName(metadataSource.type)}
        </Text>
      </HStack>
    </HStack>
  )
}
