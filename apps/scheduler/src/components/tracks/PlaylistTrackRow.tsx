import { Box, Flex, IconButton, Text, VStack } from "@chakra-ui/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { GripVertical, Trash2 } from "lucide-react"
import type { QueueItem } from "@repo/types/Queue"
import { queueItemAlbumLine, queueItemArtistLine } from "./queueItemDisplay"
import { TrackArtworkThumb } from "./TrackArtworkThumb"

export const PUBLISH_PLAYLIST_SORTABLE_GROUP = "publish-playlist"

export function queueItemTitle(item: QueueItem): string {
  return item.title || item.track?.title || "Untitled"
}

function TrackTextBlock({ item }: { item: QueueItem }) {
  const title = queueItemTitle(item)
  const artists = queueItemArtistLine(item)
  const album = queueItemAlbumLine(item)

  return (
    <VStack align="start" gap={0} flex="1" minW={0}>
      <Text fontSize="sm" fontWeight="medium" w="full" truncate>
        {title}
      </Text>
      {artists ? (
        <Text fontSize="xs" color="fg.muted" w="full" truncate>
          {artists}
        </Text>
      ) : null}
      {album ? (
        <Text fontSize="xs" color="fg.muted" w="full" truncate>
          {album}
        </Text>
      ) : null}
    </VStack>
  )
}

export function PlaylistTrackRow({
  sortableId,
  index,
  item,
  onRemove,
}: {
  sortableId: string
  index: number
  item: QueueItem
  onRemove: () => void
}) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: sortableId,
    index,
    group: PUBLISH_PLAYLIST_SORTABLE_GROUP,
    data: { type: "playlist-track" },
  })

  return (
    <Flex
      ref={ref}
      align="center"
      gap={2}
      py={2}
      px={3}
      borderWidth="1px"
      borderRadius="md"
      borderColor={isDropTarget ? "blue.solid" : "border.muted"}
      bg="bg.subtle"
      opacity={isDragging ? 0.5 : 1}
    >
      <Box
        ref={handleRef}
        cursor="grab"
        color="fg.muted"
        display="flex"
        alignItems="center"
        flexShrink={0}
      >
        <GripVertical size={18} />
      </Box>
      <TrackArtworkThumb item={item} />
      <TrackTextBlock item={item} />
      <IconButton aria-label="Remove track" variant="ghost" size="sm" onClick={onRemove}>
        <Trash2 size={16} />
      </IconButton>
    </Flex>
  )
}

/** Matches {@link PlaylistTrackRow} layout for drag overlay (no sortable hooks). */
export function PlaylistTrackDragPreview({ item }: { item: QueueItem }) {
  return (
    <Flex
      align="center"
      gap={2}
      py={2}
      px={3}
      borderWidth="1px"
      borderRadius="md"
      bg="bg.panel"
      boxShadow="md"
    >
      <Box color="fg.muted" display="flex" alignItems="center" flexShrink={0}>
        <GripVertical size={18} />
      </Box>
      <TrackArtworkThumb item={item} />
      <TrackTextBlock item={item} />
    </Flex>
  )
}
