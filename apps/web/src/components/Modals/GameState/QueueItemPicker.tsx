import { useState } from "react"
import { Box, Popover, Text, VStack } from "@chakra-ui/react"
import PlaylistItem from "../../PlaylistItem"
import { useQueueList, useCurrentRoom } from "../../../hooks/useActors"
import type { QueueItem } from "../../../types/Queue"

/**
 * Choose a queued track to target for inventory use (e.g. promote).
 * Parent handles socket emit after `onPick(metadataTrackId)` (`QueueItem.track.id`).
 */
export function InventoryUseQueueItemPicker({
  children,
  onPick,
}: {
  children: React.ReactNode
  onPick: (targetQueueItemId: string) => void
}) {
  const queue = useQueueList()
  const room = useCurrentRoom()
  const playbackMode = room?.playbackMode
  const [open, setOpen] = useState(false)

  const promotable = queue.filter((item, i) => i > 0 && !item.locked)

  const choose = (item: QueueItem) => {
    setOpen(false)
    onPick(item.track.id)
  }

  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} lazyMount>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content
          css={{ "--popover-bg": "{colors.appBg}" }}
          minW="min(360px, 92vw)"
          maxW="92vw"
          maxH="min(360px, 60vh)"
          overflowY="auto"
          p={2}
        >
          {promotable.length === 0 ? (
            <Text fontSize="xs" color="fg.muted" px={1}>
              No tracks can be promoted right now (need at least two songs after the first in
              queue).
            </Text>
          ) : (
            <VStack align="stretch" gap={2}>
              {promotable.map((item) => (
                <Box
                  key={`${item.addedAt}-${item.track.id}`}
                  borderRadius="md"
                  cursor="pointer"
                  _hover={{ bg: "primary.subtle/40" }}
                  onClick={() => choose(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      choose(item)
                    }
                  }}
                  css={{
                    "& *": { pointerEvents: "none" },
                  }}
                >
                  <PlaylistItem item={item} isQueueItem playbackMode={playbackMode} />
                </Box>
              ))}
            </VStack>
          )}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
