import { useMemo } from "react"
import { LuMusic, LuUser, LuWaves } from "react-icons/lu"
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
  Image,
} from "@chakra-ui/react"
import { format } from "date-fns"

import AlbumArtwork from "../AlbumArtwork"
import safeDate from "../../lib/safeDate"
import nullifyEmptyString from "../../lib/nullifyEmptyString"
import { User } from "../../types/User"
import { Room, RoomMeta } from "../../types/Room"
import { PluginArea } from "../PluginComponents"
import { usePluginStyles } from "../../hooks/usePluginStyles"
import { usePluginElementProps } from "../../hooks/usePluginElementProps"
import { usePreferredMetadataSource } from "../../hooks/useActors"
import { MetadataSourceType } from "../../types/Queue"
import type { PluginElementProps } from "@repo/types"

type RevealedBy = NonNullable<PluginElementProps["revealedBy"]>

interface NowPlayingTrackProps {
  meta: RoomMeta
  room: Partial<Room> | null
  users: User[]
}

/** Neutral “hidden artwork” placeholder (SVG data URI — no network). */
const OBSCURED_ARTWORK_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="obArtG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3d3d48"/>
          <stop offset="100%" stop-color="#26262e"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill="url(#obArtG)"/>
      <circle cx="256" cy="256" r="132" fill="none" stroke="#5c5c6a" stroke-width="10"/>
      <circle cx="256" cy="256" r="48" fill="#5c5c6a"/>
    </svg>`,
  )

function getCoverUrl(release: any, room: Partial<Room> | null): string | null {
  const useRoomArtwork = room?.artwork && (!room.artworkStreamingOnly || !room.fetchMeta)
  if (useRoomArtwork) {
    return room.artwork!
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

  const titleElementProps = usePluginElementProps(nowPlaying?.pluginData, "title")
  const artistElementProps = usePluginElementProps(nowPlaying?.pluginData, "artist")
  const albumElementProps = usePluginElementProps(nowPlaying?.pluginData, "album")
  const artworkElementProps = usePluginElementProps(nowPlaying?.pluginData, "artwork")

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
    <VStack align="start" gap={4} w="100%" data-screen-effect-target="nowPlaying">
      <LinkBox width="100%">
        <Stack direction={["row", "column"]} gap={5} justify="center" flexGrow={1}>
          {coverUrl && (
            <Box position="relative" width={artworkSize} height={artworkSize}>
              <Box position="absolute">
                <PluginArea area="nowPlayingArt" color="primaryBg" />
              </Box>
              <Box position="relative" overflow="hidden" borderRadius="md" height="100%" width="100%">
                {artworkElementProps.obscured ? (
                  <Image
                    src={OBSCURED_ARTWORK_PLACEHOLDER}
                    alt=""
                    height="100%"
                    width="100%"
                    objectFit="cover"
                    draggable={false}
                  />
                ) : (
                  <AlbumArtwork coverUrl={coverUrl} />
                )}
              </Box>
            </Box>
          )}
          <VStack align="start" gap={0}>
            <ObscuredTitleBlock
              obscured={titleElementProps.obscured}
              placeholder={titleElementProps.placeholder}
              revealedBy={titleElementProps.revealedBy}
              externalUrl={externalUrl}
              pluginStyles={titleStyles}
            >
              {titleDisplay}
            </ObscuredTitleBlock>

            <PluginArea area="nowPlayingBadge" />

            {artist && (
              <ObscuredTextBlock
                obscured={artistElementProps.obscured}
                placeholder={artistElementProps.placeholder}
                revealedBy={artistElementProps.revealedBy}
                asHeading
              >
                {artist}
              </ObscuredTextBlock>
            )}

            {album && (
              <ObscuredTextBlock
                obscured={albumElementProps.obscured}
                placeholder={albumElementProps.placeholder}
                revealedBy={albumElementProps.revealedBy}
              >
                {album}
              </ObscuredTextBlock>
            )}

            {releaseDate && (
              <Text as="span" color="primary.contrast/50" fontSize="xs">
                Released {safeDate(releaseDate)}
              </Text>
            )}

            <AddedByInfo dj={dj} djUsername={djUsername} addedAt={addedAt} />

            <Box colorPalette="primary" color="colorPalette.contrast">
              <PluginArea area="nowPlayingInfo" />
            </Box>

            <MetadataSourceInfo metadataSource={activeMetadataSource} />
          </VStack>
        </Stack>
      </LinkBox>
    </VStack>
  )
}

// Sub-components

function guessRevealCreditLine(revealedBy: RevealedBy): string {
  const name = revealedBy.username?.trim() || "someone"
  return revealedBy.source === "admin" ? `Revealed by ${name}` : `Identified by ${name}`
}

const shimmerCss = {
  "@keyframes nowPlayingShimmer": {
    "0%": { opacity: 0.35 },
    "50%": { opacity: 0.95 },
    "100%": { opacity: 0.35 },
  },
  animation: "nowPlayingShimmer 2.2s ease-in-out infinite",
}

interface ObscuredTitleBlockProps {
  children: string | null
  obscured: boolean
  placeholder?: string
  revealedBy?: RevealedBy | null
  externalUrl: string | null
  pluginStyles: React.CSSProperties
}

function ObscuredTitleBlock({
  children,
  obscured,
  placeholder,
  revealedBy,
  externalUrl,
  pluginStyles,
}: ObscuredTitleBlockProps) {
  const headingStyles = {
    color: "primary.contrast",
    margin: "none",
    as: "h3" as const,
    size: ["md", "2xl"] as any,
  }

  if (obscured) {
    const label = placeholder ?? "???"
    return (
      <Heading {...headingStyles} css={shimmerCss} userSelect="none" aria-hidden="true">
        {label}
      </Heading>
    )
  }

  const credit =
    revealedBy != null ? (
      <Text fontSize="2xs" color="primary.contrast/55" mt={1}>
        {guessRevealCreditLine(revealedBy)}
      </Text>
    ) : null

  if (externalUrl && children) {
    return (
      <>
        <LinkOverlay href={externalUrl} target="_blank" rel="noopener noreferrer">
          <Heading {...headingStyles} style={pluginStyles}>
            {children}
          </Heading>
        </LinkOverlay>
        {credit}
      </>
    )
  }

  return (
    <>
      <Heading {...headingStyles} style={pluginStyles}>
        {children}
      </Heading>
      {credit}
    </>
  )
}

interface ObscuredTextBlockProps {
  children: string
  obscured: boolean
  placeholder?: string
  revealedBy?: RevealedBy | null
  /** Use heading styles for artist line */
  asHeading?: boolean
}

function ObscuredTextBlock({
  children,
  obscured,
  placeholder,
  revealedBy,
  asHeading,
}: ObscuredTextBlockProps) {
  if (obscured) {
    const label = placeholder ?? "???"
    if (asHeading) {
      return (
        <Heading
          color="primary.contrast"
          margin="none"
          as="h4"
          size="sm"
          css={shimmerCss}
          userSelect="none"
          aria-hidden="true"
        >
          {label}
        </Heading>
      )
    }
    return (
      <Text
        as="span"
        color="primary.contrast/50"
        margin="none"
        fontSize="xs"
        css={shimmerCss}
        userSelect="none"
        aria-hidden="true"
      >
        {label}
      </Text>
    )
  }

  const credit =
    revealedBy != null ? (
      <Text fontSize="2xs" color="primary.contrast/45" mt={0.5}>
        {guessRevealCreditLine(revealedBy)}
      </Text>
    ) : null

  if (asHeading) {
    return (
      <Box>
        <Heading color="primary.contrast" margin="none" as="h4" size="sm">
          {children}
        </Heading>
        {credit}
      </Box>
    )
  }

  return (
    <Box>
      <Text as="span" color="primary.contrast/50" margin="none" fontSize="xs">
        {children}
      </Text>
      {credit}
    </Box>
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
      <Icon color="primary.contrast" boxSize={3} as={LuUser} />
      <Text as="i" color="primary.contrast" fontSize="xs">
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
        return LuMusic
      case "tidal":
        return LuWaves
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
      <Text as="span" color="primary.contrast/50" fontSize="2xs">
        Track data provided by
      </Text>
      <HStack gap={1}>
        {SourceIcon && <Icon as={SourceIcon} color="primary.contrast/50" boxSize={3} />}
        <Text color="primary.contrast/50" fontSize="2xs" as="span">
          {getSourceName(metadataSource.type)}
        </Text>
      </HStack>
    </HStack>
  )
}
