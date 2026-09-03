import { useMemo, memo, useState, useCallback } from "react"
import { format } from "date-fns"
import {
  Stack,
  LinkBox,
  LinkOverlay,
  Text,
  Icon,
  Image,
  Box,
  HStack,
  IconButton,
  useSlotRecipe,
} from "@chakra-ui/react"

import { PlaylistItem as PlaylistItemType, getPreferredTrack } from "../types/PlaylistItem"
import { LuPlay, LuSkipForward, LuTrash2, LuUser, LuX, LuChartColumn } from "react-icons/lu"
import {
  usePreferredMetadataSource,
  useIsAdmin,
  useIsRoomCreator,
  useCurrentUser,
  useCurrentRoom,
} from "../hooks/useActors"
import { usePresentedAttribution } from "../hooks/usePresentedAttribution"
import { getIcon } from "./PluginComponents/icons"
import { PluginArea } from "./PluginComponents"
import { emitToSocket } from "../actors/socketActor"
import socket from "../lib/socket"
import ConfirmationDialog from "./ConfirmationDialog"
import { toast } from "../lib/toasts"
import { playlistItemRecipe } from "../theme/playlistItemRecipe"
import type { Room } from "../types/Room"
import { usePluginElementProps } from "../hooks/usePluginElementProps"
import { getTrackExternalUrl } from "../lib/getTrackExternalUrl"
import { usePhysicalMediaArt } from "../hooks/usePhysicalMediaArt"
import FramedArtwork from "./artworkFrames/FramedArtwork"
import TrackStatsPopover from "./TrackStatsPopover"

const shimmerCss = {
  "@keyframes playlistItemShimmer": {
    "0%": { opacity: 0.35 },
    "50%": { opacity: 0.95 },
    "100%": { opacity: 0.35 },
  },
  animation: "playlistItemShimmer 2.2s ease-in-out infinite",
}

type Props = {
  item: PlaylistItemType
  /** Whether this item is in the queue (not yet played) vs playlist history */
  isQueueItem?: boolean
  /** When `app-controlled`, queue removal is applied in Redis; otherwise only a request is sent. */
  playbackMode?: Room["playbackMode"]
  showControls?: boolean
}

const PlaylistItem = memo(function PlaylistItem({
  item,
  isQueueItem = false,
  playbackMode,
  showControls = true,
}: Props) {
  const preferredSource = usePreferredMetadataSource()
  const isAdmin = useIsAdmin()
  const isRoomCreator = useIsRoomCreator()
  const currentUser = useCurrentUser()
  const room = useCurrentRoom()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Check if current user added this track (for queue items)
  const isOwnTrack = currentUser?.userId === item.addedBy?.userId

  // Get track data from preferred metadata source (or fall back to default)
  const preferredTrack = useMemo(
    () => getPreferredTrack(item, preferredSource),
    [item, preferredSource],
  )
  const titleElementProps = usePluginElementProps(item.pluginData, "title")
  const artistElementProps = usePluginElementProps(item.pluginData, "artist")
  const artworkElementProps = usePluginElementProps(item.pluginData, "artwork")

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (item.playedAt) {
      emitToSocket("DELETE_PLAYLIST_TRACK", { playedAt: item.playedAt })
    }
    setIsDeleteDialogOpen(false)
  }, [item.playedAt])

  const handleDeleteCancel = useCallback(() => {
    setIsDeleteDialogOpen(false)
  }, [])

  const handleRequestRemoval = useCallback(() => {
    emitToSocket("REQUEST_QUEUE_REMOVAL", { trackId: item.track.id })
    toast({
      title: "Removal requested",
      description: "The room admin has been notified.",
      type: "info",
      duration: 3000,
    })
  }, [item.track.id])

  const handleRemoveFromQueueDirect = useCallback(() => {
    let timeoutId: number
    const onEvent = (payload: { type?: string; data?: { message?: string; trackId?: string } }) => {
      if (payload.type === "REMOVE_FROM_QUEUE_SUCCESS" && payload.data?.trackId === item.track.id) {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
        toast({
          title: "Removed from queue",
          type: "success",
          duration: 3000,
        })
      }
      if (payload.type === "REMOVE_FROM_QUEUE_FAILURE" && payload.data?.trackId === item.track.id) {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
        toast({
          title: "Couldn't remove track",
          description: payload.data?.message,
          type: "error",
          duration: 4000,
        })
      }
    }
    socket.on("event", onEvent)
    timeoutId = window.setTimeout(() => socket.off("event", onEvent), 10000)
    emitToSocket("REMOVE_FROM_QUEUE", { trackId: item.track.id })
  }, [item.track.id])

  const handlePlayQueuedTrack = useCallback(() => {
    let timeoutId: number
    const onEvent = (payload: { type?: string; data?: { message?: string; trackId?: string } }) => {
      if (payload.type === "PLAY_QUEUED_TRACK_SUCCESS" && payload.data?.trackId === item.track.id) {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
        toast({
          title: `Playing ${preferredTrack?.title}`,
          type: "success",
          duration: 3000,
        })
      }
      if (payload.type === "PLAY_QUEUED_TRACK_FAILURE" && payload.data?.trackId === item.track.id) {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
        toast({
          title: "Couldn't start playback",
          description: payload.data?.message,
          type: "error",
          duration: 4000,
        })
      }
    }
    socket.on("event", onEvent)
    timeoutId = window.setTimeout(() => socket.off("event", onEvent), 10000)
    emitToSocket("PLAY_QUEUED_TRACK", { trackId: item.track.id })
  }, [item.track.id])

  // Get album art from preferred track
  const artThumb = useMemo(() => {
    const imageUrl = preferredTrack?.album?.images?.find(
      (img) => img.type === "image" && img.url,
    )?.url
    return imageUrl
  }, [preferredTrack?.album?.images])

  const framedArt = usePhysicalMediaArt({
    pluginData: item.pluginData as Record<string, unknown> | undefined,
    trackArtUrl: artThumb,
    disabled: artworkElementProps.obscured,
  })

  // Prefer baked attribution (ADR 0150); X-Ray pierces to the live true name.
  const {
    displayName: djUsername,
    pierced: showPierceIcon,
    PierceIcon,
  } = usePresentedAttribution({
    userId: item.addedBy?.userId,
    bakedUsername: item.addedBy?.username,
    fallback: "Someone",
  })

  const externalUrl = useMemo(() => getTrackExternalUrl(preferredTrack), [preferredTrack])

  // Check if track was skipped by playlist-democracy plugin
  const isSkipped = item.pluginData?.["playlist-democracy"]?.skipped === true
  const skipData = item.pluginData?.["playlist-democracy"]?.skipData

  const recipe = useSlotRecipe({ recipe: playlistItemRecipe })
  const styles = recipe({ isSkipped, isHovered })

  const isAppControlledQueue = playbackMode === "app-controlled"
  const canActOnQueueItem =
    showControls &&
    isQueueItem &&
    (isAppControlledQueue ? Boolean(isOwnTrack || isAdmin) : Boolean(isOwnTrack))
  /** Immediate Spotify playback is restricted to room admins / creator (server enforces the same). */
  const canPlayQueuedTrackNow =
    canActOnQueueItem && isAppControlledQueue && (isAdmin || isRoomCreator)

  const showTrackStats = !titleElementProps.obscured && Boolean(room?.id)

  const artistLine = artistElementProps.obscured
    ? (artistElementProps.placeholder ?? "???")
    : preferredTrack?.artists?.map((a) => a.title).join(" · ")

  return (
    <Box
      w="100%"
      minW={0}
      css={{
        containerType: "inline-size",
        containerName: "playlist-item",
      }}
    >
      <HStack
        key={item.playedAt?.toString() || item.addedAt.toString()}
        css={styles.root}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <LinkBox css={styles.trackInfo}>
          <HStack gap={2} align="center" minW={0}>
            {(artThumb || framedArt) && (
              <Box css={styles.artwork} overflow={framedArt ? "visible" : undefined}>
                {artworkElementProps.obscured ? (
                  <Box width="100%" height="100%" bg="colorPalette.muted" css={shimmerCss} />
                ) : framedArt ? (
                  <FramedArtwork art={framedArt} size="row" squareSlot alt="" />
                ) : (
                  <Image loading="lazy" src={artThumb!} w="100%" h="100%" objectFit="cover" />
                )}
              </Box>
            )}
            <Stack css={styles.trackDetails}>
              {preferredTrack && (
                <HStack gap={1} minW={0} w="100%">
                  <LinkOverlay
                    target="_blank"
                    href={externalUrl}
                    m={0}
                    display="block"
                    minW={0}
                    flex="1"
                    overflow="hidden"
                  >
                    <Text
                      css={{ ...styles.title, ...(titleElementProps.obscured ? shimmerCss : {}) }}
                      title={titleElementProps.obscured ? undefined : preferredTrack.title}
                    >
                      {titleElementProps.obscured
                        ? (titleElementProps.placeholder ?? "???")
                        : preferredTrack.title}
                    </Text>
                  </LinkOverlay>
                  {isSkipped && (
                    <Icon as={LuSkipForward} color="orange.400" boxSize={3} flexShrink={0} />
                  )}
                </HStack>
              )}
              {artistLine && (
                <Text
                  css={{
                    ...styles.artist,
                    ...(artistElementProps.obscured ? shimmerCss : {}),
                  }}
                  fontSize="xs"
                  title={artistElementProps.obscured ? undefined : artistLine}
                >
                  {artistLine}
                </Text>
              )}
            </Stack>
          </HStack>
        </LinkBox>

        <HStack css={styles.metadata}>
          <Stack css={styles.metaText}>
            <Text color="colorPalette.fg/70" fontSize="xs" whiteSpace="nowrap" textAlign="right">
              {item.playedAt ? format(item.playedAt, "p") : format(item.addedAt, "p")}
            </Text>

            {!!item.addedBy && (
              <HStack
                gap={1}
                align="center"
                minW={0}
                css={{
                  "@container playlist-item (max-width: 30rem)": {
                    maxW: "8rem",
                  },
                }}
              >
                <Icon boxSize={3} color="colorPalette.fg/70" as={LuUser} flexShrink={0} />
                {PierceIcon ? (
                  <Icon boxSize={3} color="colorPalette.fg/70" as={PierceIcon} flexShrink={0} />
                ) : null}
                <Text as="i" fontSize="xs" color="colorPalette.fg/70" truncate title={djUsername}>
                  <Box as="span" css={styles.addedByLabel}>
                    Added by{" "}
                  </Box>
                  {djUsername}
                </Text>
              </HStack>
            )}

            {isSkipped && skipData && (
              <Text fontSize="2xs" whiteSpace="nowrap" color="colorPalette.fg/70">
                Skipped: {skipData.voteCount}/{skipData.requiredCount} votes
              </Text>
            )}
          </Stack>

          <HStack gap={0} flexShrink={0} align="center">
            <PluginArea area="playlistItem" />
            {showTrackStats && (
              <TrackStatsPopover
                roomId={room?.id}
                item={item}
                trackTitle={
                  titleElementProps.obscured
                    ? (titleElementProps.placeholder ?? "???")
                    : (preferredTrack?.title ?? "Track")
                }
              >
                <IconButton
                  aria-label="Track stats"
                  size="xs"
                  variant="ghost"
                  colorPalette="primary"
                >
                  <LuChartColumn />
                </IconButton>
              </TrackStatsPopover>
            )}
            {isAdmin && item.playedAt && !isQueueItem && (
              <IconButton
                aria-label="Delete track from playlist"
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={handleDeleteClick}
                css={styles.deleteButton}
              >
                <LuTrash2 />
              </IconButton>
            )}
            {canPlayQueuedTrackNow && (
              <IconButton
                aria-label="Play this track on Spotify"
                size="xs"
                variant="ghost"
                colorPalette="primary"
                onClick={handlePlayQueuedTrack}
              >
                <LuPlay />
              </IconButton>
            )}
            {canActOnQueueItem && (
              <IconButton
                aria-label={
                  isAppControlledQueue ? "Remove from queue" : "Request removal from queue"
                }
                size="xs"
                variant="ghost"
                colorPalette="orange"
                onClick={isAppControlledQueue ? handleRemoveFromQueueDirect : handleRequestRemoval}
              >
                <LuX />
              </IconButton>
            )}
          </HStack>
        </HStack>

        <ConfirmationDialog
          open={isDeleteDialogOpen}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Track"
          body={
            <Text>
              Are you sure you want to remove{" "}
              <Text as="strong">{preferredTrack?.title || "this track"}</Text> from the playlist?
              This will also remove it from room exports.
            </Text>
          }
          confirmLabel="Delete"
          isDangerous
        />
      </HStack>
    </Box>
  )
})

export default PlaylistItem
