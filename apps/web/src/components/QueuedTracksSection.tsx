import { useMemo, useRef, useCallback, memo } from "react"
import {
  Box,
  Button,
  Heading,
  HStack,
  Badge,
  Separator,
  VStack,
  ScrollArea,
} from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { DragDropProvider, DragOverlay } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { isSortable } from "@dnd-kit/react/sortable"
import { move } from "@dnd-kit/helpers"
import { canonicalQueueTrackKey, type QueueItem as SharedQueueItem } from "@repo/types/Queue"
import { GripVertical } from "lucide-react"
import { QueueItem } from "../types/Queue"
import {
  useQueueList,
  useCurrentRoom,
  useIsAdmin,
  useIsRoomCreator,
  useCanReorderQueue,
} from "../hooks/useActors"
import { emitToSocket } from "../actors/socketActor"
import socket from "../lib/socket"
import { toast } from "../lib/toasts"
import PlaylistItem from "./PlaylistItem"
import ButtonAddToQueue from "./ButtonAddToQueue"
import type { Room } from "../types/Room"

const ITEM_HEIGHT = 70
const MAX_LIST_HEIGHT = 200

export const ROOM_QUEUE_SORTABLE_GROUP = "room-queue"

function toCanonicalKey(item: QueueItem): string {
  return canonicalQueueTrackKey(item as unknown as SharedQueueItem)
}

const LockedQueueRow = memo(function LockedQueueRow({
  item,
  playbackMode,
}: {
  item: QueueItem
  playbackMode?: Room["playbackMode"]
}) {
  const canReorder = useCanReorderQueue()
  return (
    <Box w="100%" opacity={canReorder ? 0.5 : 1}>
      <PlaylistItem item={item} isQueueItem playbackMode={playbackMode} />
    </Box>
  )
})

const SortableQueueRow = memo(function SortableQueueRow({
  item,
  index,
  playbackMode,
}: {
  item: QueueItem
  index: number
  playbackMode?: Room["playbackMode"]
}) {
  const id = toCanonicalKey(item)
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    group: ROOM_QUEUE_SORTABLE_GROUP,
    data: { type: "queue-item" as const, item },
  })

  return (
    <Box ref={ref} opacity={isDragging ? 0.5 : 1} w="100%">
      <HStack align="flex-start" gap={2} w="100%">
        <Box
          ref={handleRef}
          cursor="grab"
          color="fg.muted"
          pt={1}
          flexShrink={0}
          aria-label="Reorder in queue"
        >
          <GripVertical size={18} />
        </Box>
        <Box flex="1" minW={0}>
          <PlaylistItem item={item} isQueueItem playbackMode={playbackMode} />
        </Box>
      </HStack>
    </Box>
  )
})

function QueueDragPreview({
  item,
  playbackMode,
}: {
  item: QueueItem
  playbackMode?: Room["playbackMode"]
}) {
  return (
    <HStack
      align="flex-start"
      gap={2}
      w="100%"
      p={2}
      borderRadius="md"
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
    >
      <Box color="fg.muted" pt={1} flexShrink={0}>
        <GripVertical size={18} />
      </Box>
      <Box flex="1" minW={0}>
        <PlaylistItem item={item} isQueueItem playbackMode={playbackMode} />
      </Box>
    </HStack>
  )
}

function QueuedTracksSection() {
  const queue: QueueItem[] = useQueueList()
  const room = useCurrentRoom()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const isAdmin = useIsAdmin()
  const isRoomCreator = useIsRoomCreator()
  const isAppControlled = room?.playbackMode === "app-controlled"
  const canResumeOrEmptyControls = isAppControlled && (isRoomCreator || isAdmin)
  const canReorder = useCanReorderQueue()

  const showQueueTracks = room?.showQueueTracks !== false

  const orderedKeys = useMemo(
    () => queue.filter((item) => !item.locked).map((item) => toCanonicalKey(item)),
    [queue],
  )

  const hasSortableItems = orderedKeys.length > 0

  const handleDragEnd = useCallback(
    (event: { canceled?: boolean } & Parameters<typeof move>[1]) => {
      if (event.canceled) return
      const newKeys = move(orderedKeys, event)
      if (JSON.stringify(newKeys) === JSON.stringify(orderedKeys)) return

      let timeoutId: number
      const onEvent = (payload: { type?: string; data?: { message?: string } }) => {
        if (payload.type === "REORDER_QUEUE_SUCCESS") {
          socket.off("event", onEvent)
          window.clearTimeout(timeoutId)
        }
        if (payload.type === "REORDER_QUEUE_FAILURE") {
          socket.off("event", onEvent)
          window.clearTimeout(timeoutId)
          toast({
            title: "Couldn't reorder queue",
            description: payload.data?.message,
            type: "error",
            duration: 4000,
          })
        }
      }
      socket.on("event", onEvent)
      timeoutId = window.setTimeout(() => socket.off("event", onEvent), 10000)
      emitToSocket("REORDER_QUEUE", { orderedKeys: newKeys as string[] })
    },
    [orderedKeys],
  )

  const handleResumePlayback = useCallback(() => {
    let timeoutId: number
    const onEvent = (payload: { type?: string; data?: { message?: string } }) => {
      if (payload.type === "RESUME_PLAYBACK_SUCCESS") {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
        toast({
          title: "Playback resumed",
          type: "success",
          duration: 3000,
        })
      }
      if (payload.type === "RESUME_PLAYBACK_FAILURE") {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
        toast({
          title: "Couldn't resume playback",
          description: payload.data?.message,
          type: "error",
          duration: 4000,
        })
      }
    }
    socket.on("event", onEvent)
    timeoutId = window.setTimeout(() => socket.off("event", onEvent), 10000)
    emitToSocket("RESUME_PLAYBACK", {})
  }, [])

  const virtualRowCount = queue.length
  const listHeight = useMemo(() => {
    const contentHeight = virtualRowCount * ITEM_HEIGHT
    return Math.min(contentHeight, MAX_LIST_HEIGHT)
  }, [virtualRowCount])

  const virtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 78,
    overscan: 4,
    getItemKey: (index) => {
      const item = queue[index]
      return item ? `${item.addedAt}-${item.track.id}` : index
    },
    enabled: (!canReorder || !hasSortableItems) && virtualRowCount > 0,
  })

  if (!showQueueTracks) {
    return null
  }

  if (queue.length === 0 && !canResumeOrEmptyControls) {
    return null
  }

  const virtualItems = virtualizer.getVirtualItems()

  const playbackMode = room?.playbackMode

  const sortableList =
    queue.length > 0 ? (
      <VStack gap={2} w="100%" align="stretch" pb={2}>
        {queue.map((item, i) => {
          const key = toCanonicalKey(item)
          if (item.locked) {
            return <LockedQueueRow key={key} item={item} playbackMode={playbackMode} />
          }
          const sortableIndex = queue.slice(0, i).filter((x) => !x.locked).length
          return (
            <SortableQueueRow
              key={key}
              item={item}
              index={sortableIndex}
              playbackMode={playbackMode}
            />
          )
        })}
      </VStack>
    ) : null

  const virtualList =
    virtualRowCount > 0 ? (
      <Box position="relative" width="100%" height={`${virtualizer.getTotalSize()}px`}>
        {virtualItems.map((virtualRow) => {
          const item = queue[virtualRow.index]
          if (!item) return null

          return (
            <Box
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              position="absolute"
              top={0}
              left={0}
              width="100%"
              transform={`translateY(${virtualRow.start}px)`}
            >
              <VStack pb={2} gap={2} w="100%" align="stretch">
                <PlaylistItem item={item} isQueueItem playbackMode={playbackMode} />
                {virtualRow.index < virtualRowCount - 1 && (
                  <Separator borderColor="secondaryBorder" opacity={0.5} />
                )}
              </VStack>
            </Box>
          )
        })}
      </Box>
    ) : null

  const listBody =
    canReorder && hasSortableItems ? (
      <DragDropProvider onDragEnd={handleDragEnd}>
        <VStack align="stretch" gap={0} w="100%">
          {sortableList}
        </VStack>
        <DragOverlay dropAnimation={null}>
          {(source) => {
            if (!source || !isSortable(source)) return null
            const sid = String(source.id)
            const rowItem = queue.find((q) => !q.locked && toCanonicalKey(q) === sid)
            if (!rowItem) return null
            return <QueueDragPreview item={rowItem} playbackMode={playbackMode} />
          }}
        </DragOverlay>
      </DragDropProvider>
    ) : (
      <VStack align="stretch" gap={0} w="100%">
        {virtualList}
      </VStack>
    )

  const badgeCount = virtualRowCount

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
              {badgeCount}
            </Badge>
          </HStack>
          {canResumeOrEmptyControls && (
            <Button
              variant="outline"
              colorPalette="primary"
              size="xs"
              onClick={handleResumePlayback}
            >
              Resume
            </Button>
          )}
          <ButtonAddToQueue variant="solid" colorPalette="primary" size="xs" showCount={false} />
        </HStack>
        {virtualRowCount > 0 ? (
          <Box w="100%">
            <ScrollArea.Root height={`${listHeight}px`} size="sm" variant="hover">
              <ScrollArea.Viewport ref={viewportRef} height="100%">
                <ScrollArea.Content>{listBody}</ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar>
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
              <ScrollArea.Corner />
            </ScrollArea.Root>
          </Box>
        ) : null}
      </VStack>
    </Box>
  )
}

export default QueuedTracksSection
