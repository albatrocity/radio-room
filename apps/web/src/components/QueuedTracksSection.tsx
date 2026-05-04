import { useMemo, useRef, useCallback } from "react"
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
import { QueueItem } from "../types/Queue"
import {
  useQueueList,
  useCurrentRoom,
  useIsAdmin,
  useIsRoomCreator,
} from "../hooks/useActors"
import { emitToSocket } from "../actors/socketActor"
import socket from "../lib/socket"
import { toast } from "../lib/toasts"
import PlaylistItem from "./PlaylistItem"
import ButtonAddToQueue from "./ButtonAddToQueue"

// Approximate heights for calculating list size
const ITEM_HEIGHT = 70 // Each PlaylistItem (image 48px + metadata + padding)
const MAX_LIST_HEIGHT = 200 // Cap the list height

function QueuedTracksSection() {
  const queue: QueueItem[] = useQueueList()
  const room = useCurrentRoom()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const isAdmin = useIsAdmin()
  const isRoomCreator = useIsRoomCreator()
  const isAppControlled = room?.playbackMode === "app-controlled"
  const canResumeOrEmptyControls = isAppControlled && (isRoomCreator || isAdmin)

  // showQueueTracks defaults to true when undefined
  const showQueueTracks = room?.showQueueTracks !== false

  // Calculate height based on queue length, capped at max
  const listHeight = useMemo(() => {
    const contentHeight = queue.length * ITEM_HEIGHT
    return Math.min(contentHeight, MAX_LIST_HEIGHT)
  }, [queue.length])

  const virtualizer = useVirtualizer({
    count: queue.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 78,
    overscan: 4,
    getItemKey: (index) => {
      const item = queue[index]
      return item ? `${item.addedAt}-${item.track.id}` : index
    },
  })

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

  if (!showQueueTracks) {
    return null
  }

  if (queue.length === 0 && !canResumeOrEmptyControls) {
    return null
  }

  const virtualItems = virtualizer.getVirtualItems()

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
        {queue.length > 0 ? (
          <Box w="100%">
            <ScrollArea.Root height={`${listHeight}px`} size="sm" variant="hover">
              <ScrollArea.Viewport ref={viewportRef} height="100%">
                <ScrollArea.Content>
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
                            <PlaylistItem
                              item={item}
                              isQueueItem
                              playbackMode={room?.playbackMode}
                            />
                            {virtualRow.index < queue.length - 1 && (
                              <Separator borderColor="secondaryBorder" opacity={0.5} />
                            )}
                          </VStack>
                        </Box>
                      )
                    })}
                  </Box>
                </ScrollArea.Content>
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
