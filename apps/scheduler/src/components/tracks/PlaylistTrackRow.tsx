import { Box, IconButton } from "@chakra-ui/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { GripVertical, Trash2 } from "lucide-react"
import type { QueueItem } from "@repo/types/Queue"
import { PlaylistItemShell } from "./PlaylistItem"
import { playlistItemFromQueueItem } from "./playlistItemMappers"

export const PUBLISH_PLAYLIST_SORTABLE_GROUP = "publish-playlist"

export function queueItemTitle(item: QueueItem): string {
  return item.title || item.track?.title || "Untitled"
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

  const lines = playlistItemFromQueueItem(item)

  return (
    <PlaylistItemShell
      ref={ref}
      {...lines}
      borderWidth="1px"
      borderRadius="md"
      borderColor={isDropTarget ? "blue.solid" : "border.muted"}
      bg="bg.subtle"
      opacity={isDragging ? 0.5 : 1}
      leading={
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
      }
      trailing={
        <IconButton aria-label="Remove track" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      }
    />
  )
}

/** Matches {@link PlaylistTrackRow} layout for drag overlay (no sortable hooks). */
export function PlaylistTrackDragPreview({ item }: { item: QueueItem }) {
  const lines = playlistItemFromQueueItem(item)

  return (
    <PlaylistItemShell
      {...lines}
      borderWidth="1px"
      borderRadius="md"
      bg="bg.panel"
      boxShadow="md"
      leading={
        <Box color="fg.muted" display="flex" alignItems="center" flexShrink={0}>
          <GripVertical size={18} />
        </Box>
      }
    />
  )
}
