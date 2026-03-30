import { Box, VStack } from "@chakra-ui/react"
import type { QueueItem } from "@repo/types/Queue"
import { PlaylistTrackRow } from "./PlaylistTrackRow"

export type PublishPlaylistRow = { id: string; item: QueueItem }

export function PublishPlaylistList({
  rows,
  onRemove,
}: {
  rows: PublishPlaylistRow[]
  onRemove: (id: string) => void
}) {
  return (
    <Box flex="1" minH={0} minW={0} overflow="auto" role="list">
      <VStack align="stretch" gap={2}>
        {rows.map((row, index) => (
          <PlaylistTrackRow
            key={row.id}
            sortableId={row.id}
            index={index}
            item={row.item}
            onRemove={() => onRemove(row.id)}
          />
        ))}
      </VStack>
    </Box>
  )
}
