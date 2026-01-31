import { useMemo, useRef } from "react"
import { Box, Heading, HStack, Badge, Separator, VStack } from "@chakra-ui/react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { QueueItem } from "../types/Queue"
import { useQueueList, useCurrentRoom } from "../hooks/useActors"
import PlaylistItem from "./PlaylistItem"
import ButtonAddToQueue from "./ButtonAddToQueue"

// Approximate heights for calculating list size
const ITEM_HEIGHT = 70 // Each PlaylistItem (image 48px + metadata + padding)
const MAX_LIST_HEIGHT = 200 // Cap the list height

function QueuedTracksSection() {
  const queue: QueueItem[] = useQueueList()
  const room = useCurrentRoom()
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // showQueueTracks defaults to true when undefined
  const showQueueTracks = room?.showQueueTracks !== false

  // Calculate height based on queue length, capped at max
  const listHeight = useMemo(() => {
    const contentHeight = queue.length * ITEM_HEIGHT
    return Math.min(contentHeight, MAX_LIST_HEIGHT)
  }, [queue.length])

  if (!showQueueTracks || queue.length === 0) {
    return null
  }

  const renderItem = (index: number) => {
    const item = queue[index]
    return (
      <VStack pb={2} gap={2} w="100%" align="stretch">
        <PlaylistItem item={item} isQueueItem />
        {index < queue.length - 1 && <Separator borderColor="secondaryBorder" opacity={0.5} />}
      </VStack>
    )
  }

  return (
    <Box
      background="primary.subtle/20"
      p={4}
      borderRadius={6}
      colorPalette="primary"
      layerStyle="themeTransition"
    >
      <VStack align="stretch" gap={4}>
        <HStack gap={2} justify="space-between">
          <HStack gap={2}>
            <Heading size="sm" color="primaryText">
              Queue
            </Heading>
            <Badge
              colorPalette="primary"
              variant="solid"
              borderRadius="full"
              fontSize="xs"
              textAlign="center"
            >
              {queue.length}
            </Badge>
          </HStack>
          <ButtonAddToQueue variant="solid" colorPalette="primary" size="xs" showCount={false} />
        </HStack>
        <Box w="100%">
          <Virtuoso
            style={{ height: listHeight }}
            totalCount={queue.length}
            itemContent={renderItem}
            ref={virtuosoRef}
          />
        </Box>
      </VStack>
    </Box>
  )
}

export default QueuedTracksSection
