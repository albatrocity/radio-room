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
  StackSeparator,
  IconButton,
  useSlotRecipe,
} from "@chakra-ui/react"

import { PlaylistItem as PlaylistItemType, getPreferredTrack } from "../types/PlaylistItem"
import { LuSkipForward, LuTrash2, LuUser, LuX } from "react-icons/lu"
import { useUsers, usePreferredMetadataSource, useIsAdmin, useCurrentUser } from "../hooks/useActors"
import { PluginArea } from "./PluginComponents"
import { emitToSocket } from "../actors/socketActor"
import ConfirmationDialog from "./ConfirmationDialog"
import { toast } from "../lib/toasts"
import { playlistItemRecipe } from "../theme/playlistItemRecipe"

type Props = {
  item: PlaylistItemType
  /** Whether this item is in the queue (not yet played) vs playlist history */
  isQueueItem?: boolean
}

const PlaylistItem = memo(function PlaylistItem({ item, isQueueItem = false }: Props) {
  const preferredSource = usePreferredMetadataSource()
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Check if current user added this track (for queue items)
  const isOwnTrack = currentUser?.userId === item.addedBy?.userId

  // Get track data from preferred metadata source (or fall back to default)
  const preferredTrack = useMemo(
    () => getPreferredTrack(item, preferredSource),
    [item, preferredSource],
  )

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

  // Get album art from preferred track
  const artThumb = useMemo(() => {
    const imageUrl = preferredTrack?.album?.images?.find(
      (img) => img.type === "image" && img.url,
    )?.url
    return imageUrl
  }, [preferredTrack?.album?.images])

  const users = useUsers()
  const djUsername = useMemo(
    () => users.find((x) => x.userId === item.addedBy?.userId)?.username ?? item.addedBy?.username,
    [users, item.addedBy],
  )

  // Get external URL from preferred track
  const externalUrl = useMemo(
    () => preferredTrack?.urls?.find((url) => url.type === "resource")?.url,
    [preferredTrack?.urls],
  )

  // Check if track was skipped by playlist-democracy plugin
  const isSkipped = item.pluginData?.["playlist-democracy"]?.skipped === true
  const skipData = item.pluginData?.["playlist-democracy"]?.skipData

  const recipe = useSlotRecipe({ recipe: playlistItemRecipe })
  const styles = recipe({ isSkipped, isHovered })

  return (
    <Stack
      key={item.playedAt?.toString() || item.addedAt.toString()}
      direction={["column", "row"]}
      css={styles.root}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <LinkBox css={styles.trackInfo}>
        <Stack direction="row">
          {artThumb && (
            <Box css={styles.artwork}>
              <Image loading="lazy" src={artThumb} />
            </Box>
          )}
          <Stack direction="column" css={styles.trackDetails}>
            {preferredTrack && (
              <HStack gap={1}>
                <LinkOverlay target="_blank" href={externalUrl} m={0}>
                  <Text css={styles.title}>{preferredTrack.title}</Text>
                </LinkOverlay>
                {isSkipped && <Icon as={LuSkipForward} color="orange.400" boxSize={3} />}
              </HStack>
            )}
            <HStack color="colorPalette.fg/70" fontSize="xs" separator={<StackSeparator />}>
              {preferredTrack?.artists?.map((a) => (
                <Text key={a.id} as="span" css={styles.artist}>
                  {a.title}
                </Text>
              ))}
            </HStack>
          </Stack>
        </Stack>
      </LinkBox>

      <Stack
        direction={["row", "column"]}
        justifyContent={["space-between", "space-around"]}
        css={styles.metadata}
      >
        <Text color="colorPalette.fg/70" fontSize="xs" textAlign="right">
          {item.playedAt ? format(item.playedAt, "p") : format(item.addedAt, "p")}
        </Text>

        {!!item.addedBy && (
          <Stack direction="row" gap={1} justifyContent="center" alignItems="center">
            <Icon boxSize={3} color="colorPalette.fg/70" as={LuUser} />
            <Text as="i" fontSize="xs" color="colorPalette.fg/70">
              Added by {djUsername}
            </Text>
          </Stack>
        )}
        <PluginArea area="playlistItem" />
        {isSkipped && (
          <Text fontSize="2xs">
            {skipData
              ? `Skipped: ${skipData.voteCount}/${skipData.requiredCount} votes`
              : undefined}
          </Text>
        )}
        {/* Delete button for playlist history (admin only) */}
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
        {/* Request removal button for queue items (own tracks only) */}
        {isQueueItem && isOwnTrack && (
          <IconButton
            aria-label="Request removal from queue"
            size="xs"
            variant="ghost"
            colorPalette="orange"
            onClick={handleRequestRemoval}
          >
            <LuX />
          </IconButton>
        )}
      </Stack>

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
    </Stack>
  )
})

export default PlaylistItem
