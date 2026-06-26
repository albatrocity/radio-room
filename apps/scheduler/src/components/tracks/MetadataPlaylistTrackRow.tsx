import { Box, Button, IconButton } from "@chakra-ui/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { GripVertical, Trash2 } from "lucide-react"
import type { MetadataSourceTrack } from "@repo/types/MetadataSource"
import { PlaylistItemShell } from "./PlaylistItem"
import { playlistItemFromMetadataTrack } from "./playlistItemMappers"

export const SEGMENT_TRACK_PICKER_SORTABLE_GROUP = "segment-track-picker"

export function MetadataPlaylistTrackRow({
  sortableId,
  index,
  track,
  onRemove,
  readOnly,
  sortableGroup = SEGMENT_TRACK_PICKER_SORTABLE_GROUP,
}: {
  sortableId: string
  index: number
  track: MetadataSourceTrack
  onRemove?: () => void
  readOnly?: boolean
  sortableGroup?: string
}) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: sortableId,
    index,
    group: sortableGroup,
    disabled: readOnly,
  })

  const lines = playlistItemFromMetadataTrack(track)

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
        !readOnly ? (
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
        ) : (
          <Box w="18px" flexShrink={0} />
        )
      }
      trailing={
        !readOnly && onRemove ? (
          <IconButton aria-label="Remove track" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 size={16} />
          </IconButton>
        ) : null
      }
    />
  )
}

export function MetadataPlaylistTrackDragPreview({ track }: { track: MetadataSourceTrack }) {
  const lines = playlistItemFromMetadataTrack(track)

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

export function MetadataPlaylistSearchResultRow({
  track,
  alreadyAdded,
  onAdd,
}: {
  track: MetadataSourceTrack
  alreadyAdded: boolean
  onAdd: () => void
}) {
  const lines = playlistItemFromMetadataTrack(track)

  return (
    <PlaylistItemShell
      {...lines}
      borderWidth="1px"
      borderRadius="md"
      borderColor="border.muted"
      bg="bg.subtle"
      trailing={
        <Button
          size="xs"
          variant="outline"
          flexShrink={0}
          disabled={alreadyAdded}
          onClick={onAdd}
        >
          {alreadyAdded ? "Added" : "Add"}
        </Button>
      }
    />
  )
}
