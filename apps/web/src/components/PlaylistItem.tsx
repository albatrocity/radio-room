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
} from "@chakra-ui/react"

import { PlaylistItem as PlaylistItemType, getPreferredTrack } from "../types/PlaylistItem"
import { FiUser, FiSkipForward, FiTrash2 } from "react-icons/fi"
import { useUsers, usePreferredMetadataSource, useIsAdmin } from "../hooks/useActors"
import { PluginArea } from "./PluginComponents"
import { emitToSocket } from "../actors/socketActor"
import ConfirmationDialog from "./ConfirmationDialog"

type Props = {
  item: PlaylistItemType
}

const PlaylistItem = memo(function PlaylistItem({ item }: Props) {
  const preferredSource = usePreferredMetadataSource()
  const isAdmin = useIsAdmin()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

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

  return (
    <Stack
      key={item.playedAt?.toString() || item.addedAt.toString()}
      direction={["column", "row"]}
      justifyContent="space-between"
      align="stretch"
      width="100%"
      opacity={isSkipped ? 0.6 : 1}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <LinkBox>
        <Stack direction="row">
          {artThumb && (
            <Box w={12} h={12}>
              <Image loading="lazy" src={artThumb} />
            </Box>
          )}
          <Stack direction="column" gap={0}>
            {preferredTrack && (
              <HStack gap={1}>
                <LinkOverlay target="_blank" href={externalUrl} m={0}>
                  <Text
                    fontWeight={"bold"}
                    textDecoration={isSkipped ? "line-through" : "none"}
                    color={isSkipped ? "colorPalette.fg/70" : "colorPalette.fg"}
                  >
                    {preferredTrack.title}
                  </Text>
                </LinkOverlay>
                {isSkipped && <Icon as={FiSkipForward} color="orange.400" boxSize={3} />}
              </HStack>
            )}
            <HStack color="colorPalette.fg/70" fontSize="xs" separator={<StackSeparator />}>
              {preferredTrack?.artists?.map((a) => (
                <Text
                  key={a.id}
                  as="span"
                  textDecoration={isSkipped ? "line-through" : "none"}
                  color={isSkipped ? "colorPalette.fg/40" : "colorPalette.fg/70"}
                >
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
        align="end"
        gap={0}
      >
        <Text color="colorPalette.fg/70" fontSize="xs" textAlign="right">
          {item.playedAt ? format(item.playedAt, "p") : format(item.addedAt, "p")}
        </Text>

        {!!item.addedBy && (
          <Stack direction="row" gap={1} justifyContent="center" alignItems="center">
            <Icon boxSize={3} color="colorPalette.fg/70" as={FiUser} />
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
        {isAdmin && item.playedAt && (
          <IconButton
            aria-label="Delete track from playlist"
            size="xs"
            variant="ghost"
            colorPalette="red"
            onClick={handleDeleteClick}
            css={{
              opacity: isHovered ? 1 : 0,
              transition: "opacity 0.2s ease-in-out",
            }}
          >
            <FiTrash2 />
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
