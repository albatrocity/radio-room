import { useMemo, useRef, useCallback, memo, useState, useEffect, Fragment } from "react"
import {
  Box,
  Button,
  Heading,
  HStack,
  Badge,
  Separator,
  Text,
  VStack,
  ScrollArea,
  Checkbox,
  IconButton,
  Group,
} from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { DragDropProvider, DragOverlay } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { isSortable } from "@dnd-kit/react/sortable"
import { move } from "@dnd-kit/helpers"
import { canonicalQueueTrackKey, type QueueItem as SharedQueueItem } from "@repo/types/Queue"
import { GripVertical } from "lucide-react"
import {
  LuPlay,
  LuPause,
  LuX,
  LuSquareSplitVertical,
  LuArrowUpToLine,
  LuArrowUp,
} from "react-icons/lu"
import { QueueItem } from "../types/Queue"
import {
  useQueueList,
  useQueueSplitKey,
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
import { Tooltip } from "./ui/tooltip"
import type { Room } from "../types/Room"

const ITEM_HEIGHT = 70
const MAX_LIST_HEIGHT = 200

type SpotifyPlaybackState = "playing" | "paused" | "stopped"

export const ROOM_QUEUE_SORTABLE_GROUP = "room-queue"
export const QUEUE_SPLIT_DIVIDER_ID = "queue-split-divider"

function toCanonicalKey(item: QueueItem): string {
  return canonicalQueueTrackKey(item as unknown as SharedQueueItem)
}

function buildSortableOrder(
  orderedKeys: string[],
  splitKey: string | null,
  includeDivider: boolean,
): string[] {
  if (!includeDivider || !splitKey) return orderedKeys
  const splitIndex = orderedKeys.indexOf(splitKey)
  if (splitIndex === -1) return orderedKeys
  return [
    ...orderedKeys.slice(0, splitIndex),
    QUEUE_SPLIT_DIVIDER_ID,
    ...orderedKeys.slice(splitIndex),
  ]
}

function listenForSocketAck(
  successType: string,
  failureType: string,
  onFailure: (message?: string) => void,
) {
  let timeoutId: number
  const onEvent = (payload: { type?: string; data?: { message?: string } }) => {
    if (payload.type === successType) {
      socket.off("event", onEvent)
      window.clearTimeout(timeoutId)
    }
    if (payload.type === failureType) {
      socket.off("event", onEvent)
      window.clearTimeout(timeoutId)
      onFailure(payload.data?.message)
    }
  }
  socket.on("event", onEvent)
  timeoutId = window.setTimeout(() => socket.off("event", onEvent), 10000)
}

const QueueSplitDivider = memo(function QueueSplitDivider({
  onRemove,
  dragHandleRef,
  isDragging,
}: {
  onRemove?: () => void
  dragHandleRef?: (element: Element | null) => void
  isDragging?: boolean
}) {
  return (
    <HStack
      gap={2}
      w="100%"
      py={1}
      px={2}
      borderRadius="md"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="primary.emphasized"
      bg="primary.subtle/30"
      opacity={isDragging ? 0.5 : 1}
      aria-label="Queue split"
    >
      {dragHandleRef ? (
        <Box
          ref={dragHandleRef}
          cursor="grab"
          color="fg.muted"
          flexShrink={0}
          aria-label="Move queue split"
        >
          <GripVertical size={18} />
        </Box>
      ) : null}
      <HStack width="100%" color="primary.solid">
        <Separator borderColor="primary.solid" flex="1" />
        <LuArrowUp />
        <Text fontSize="2xs" color="primary.solid">
          Queue split — new tracks go above
        </Text>
        <LuArrowUp />
        <Separator borderColor="primary.solid" flex="1" />
      </HStack>
      {onRemove ? (
        <IconButton
          aria-label="Remove queue split"
          variant="ghost"
          size="xs"
          colorPalette="primary"
          onClick={onRemove}
        >
          <LuX />
        </IconButton>
      ) : null}
    </HStack>
  )
})

const SortableQueueSplitDivider = memo(function SortableQueueSplitDivider({
  index,
  onRemove,
}: {
  index: number
  onRemove: () => void
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: QUEUE_SPLIT_DIVIDER_ID,
    index,
    group: ROOM_QUEUE_SORTABLE_GROUP,
    data: { type: "queue-split-divider" as const },
  })

  return (
    <Box ref={ref} w="100%">
      <QueueSplitDivider onRemove={onRemove} dragHandleRef={handleRef} isDragging={isDragging} />
    </Box>
  )
})

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
  const splitKey = useQueueSplitKey()
  const room = useCurrentRoom()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const isAdmin = useIsAdmin()
  const isRoomCreator = useIsRoomCreator()
  const isAppControlled = room?.playbackMode === "app-controlled"
  const canResumeOrEmptyControls = isAppControlled && (isRoomCreator || isAdmin)
  const canReorder = useCanReorderQueue()

  const [spotifyPlaybackState, setSpotifyPlaybackState] = useState<SpotifyPlaybackState | null>(
    null,
  )
  const [playbackTogglePending, setPlaybackTogglePending] = useState(false)

  useEffect(() => {
    if (!canResumeOrEmptyControls) return

    const onEvent = (payload: {
      type?: string
      data?: {
        state?: SpotifyPlaybackState
        message?: string
        action?: string
        trackTitle?: string
      }
    }) => {
      if (payload.type === "PLAYBACK_STATE" && payload.data?.state) {
        setSpotifyPlaybackState(payload.data.state)
      }
      if (payload.type === "PLAYBACK_STATE_CHANGED" && payload.data?.state) {
        setSpotifyPlaybackState(payload.data.state)
      }
      if (payload.type === "GET_PLAYBACK_STATE_FAILURE") {
        setSpotifyPlaybackState(null)
      }
      if (payload.type === "TOGGLE_PLAYBACK_SUCCESS") {
        setPlaybackTogglePending(false)
        if (payload.data?.state) {
          setSpotifyPlaybackState(payload.data.state)
        }
        if (payload.data?.action === "advanced" && payload.data.trackTitle) {
          toast({
            title: "Now playing",
            description: payload.data.trackTitle,
            type: "success",
            duration: 3000,
          })
        }
      }
      if (payload.type === "TOGGLE_PLAYBACK_FAILURE") {
        setPlaybackTogglePending(false)
        toast({
          title: "Couldn't control playback",
          description: payload.data?.message,
          type: "error",
          duration: 4000,
        })
      }
    }

    socket.on("event", onEvent)
    emitToSocket("GET_PLAYBACK_STATE", {})

    return () => {
      socket.off("event", onEvent)
    }
  }, [canResumeOrEmptyControls])

  const handleTogglePlayback = useCallback(() => {
    setPlaybackTogglePending(true)
    let timeoutId: number
    const onEvent = (payload: { type?: string }) => {
      if (
        payload.type === "TOGGLE_PLAYBACK_SUCCESS" ||
        payload.type === "TOGGLE_PLAYBACK_FAILURE"
      ) {
        socket.off("event", onEvent)
        window.clearTimeout(timeoutId)
      }
    }
    socket.on("event", onEvent)
    timeoutId = window.setTimeout(() => {
      socket.off("event", onEvent)
      setPlaybackTogglePending(false)
    }, 10000)
    emitToSocket("TOGGLE_PLAYBACK", {})
  }, [])

  const showQueueTracks = isAdmin || room?.showQueueTracks !== false
  const queueTracksHiddenFromListeners = isAdmin && room?.showQueueTracks === false

  const orderedKeys = useMemo(
    () => queue.filter((item) => !item.locked).map((item) => toCanonicalKey(item)),
    [queue],
  )

  const sortableOrder = useMemo(
    () => buildSortableOrder(orderedKeys, splitKey, canReorder),
    [orderedKeys, splitKey, canReorder],
  )

  const hasSortableItems = orderedKeys.length > 0
  const showAddSplit = canReorder && isAppControlled && !splitKey && orderedKeys.length >= 2

  const handleRemoveSplit = useCallback(() => {
    listenForSocketAck("REMOVE_QUEUE_SPLIT_SUCCESS", "REMOVE_QUEUE_SPLIT_FAILURE", (message) => {
      toast({
        title: "Couldn't remove queue split",
        description: message,
        type: "error",
        duration: 4000,
      })
    })
    emitToSocket("REMOVE_QUEUE_SPLIT", {})
  }, [])

  const handleAddSplit = useCallback(() => {
    const belowKey = orderedKeys[1]
    if (!belowKey) return
    listenForSocketAck("SET_QUEUE_SPLIT_SUCCESS", "SET_QUEUE_SPLIT_FAILURE", (message) => {
      toast({
        title: "Couldn't add queue split",
        description: message,
        type: "error",
        duration: 4000,
      })
    })
    emitToSocket("SET_QUEUE_SPLIT", { belowKey })
  }, [orderedKeys])

  const handleDragEnd = useCallback(
    (event: { canceled?: boolean } & Parameters<typeof move>[1]) => {
      if (event.canceled) return

      const sourceId = String(event.operation?.source?.id ?? "")

      if (sourceId === QUEUE_SPLIT_DIVIDER_ID) {
        const newOrder = move(sortableOrder, event) as string[]
        if (JSON.stringify(newOrder) === JSON.stringify(sortableOrder)) return

        const dividerIndex = newOrder.indexOf(QUEUE_SPLIT_DIVIDER_ID)
        const belowKey = newOrder[dividerIndex + 1]

        if (dividerIndex <= 0 || !belowKey || belowKey === QUEUE_SPLIT_DIVIDER_ID) {
          listenForSocketAck(
            "REMOVE_QUEUE_SPLIT_SUCCESS",
            "REMOVE_QUEUE_SPLIT_FAILURE",
            (message) => {
              toast({
                title: "Couldn't remove queue split",
                description: message,
                type: "error",
                duration: 4000,
              })
            },
          )
          emitToSocket("REMOVE_QUEUE_SPLIT", {})
          return
        }

        if (belowKey === splitKey) return

        listenForSocketAck("SET_QUEUE_SPLIT_SUCCESS", "SET_QUEUE_SPLIT_FAILURE", (message) => {
          toast({
            title: "Couldn't move queue split",
            description: message,
            type: "error",
            duration: 4000,
          })
        })
        emitToSocket("SET_QUEUE_SPLIT", { belowKey })
        return
      }

      const newKeys = (move(sortableOrder, event) as string[]).filter(
        (id) => id !== QUEUE_SPLIT_DIVIDER_ID,
      )
      if (JSON.stringify(newKeys) === JSON.stringify(orderedKeys)) return

      listenForSocketAck("REORDER_QUEUE_SUCCESS", "REORDER_QUEUE_FAILURE", (message) => {
        toast({
          title: "Couldn't reorder queue",
          description: message,
          type: "error",
          duration: 4000,
        })
      })
      emitToSocket("REORDER_QUEUE", { orderedKeys: newKeys })
    },
    [sortableOrder, orderedKeys, splitKey],
  )

  const queueAutoAdvance = room?.queueAutoAdvance !== false

  const handleQueueAutoAdvanceChange = useCallback((checked: boolean) => {
    emitToSocket("SET_ROOM_SETTINGS", { queueAutoAdvance: checked })
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
  const dividerSortableIndex = sortableOrder.indexOf(QUEUE_SPLIT_DIVIDER_ID)

  const sortableList =
    queue.length > 0 ? (
      <VStack gap={2} w="100%" align="stretch" pb={2}>
        {queue.map((item) => {
          const key = toCanonicalKey(item)
          if (item.locked) {
            return <LockedQueueRow key={key} item={item} playbackMode={playbackMode} />
          }
          const showSplitAbove = splitKey === key
          return (
            <Fragment key={key}>
              {showSplitAbove && canReorder && dividerSortableIndex !== -1 ? (
                <SortableQueueSplitDivider
                  index={dividerSortableIndex}
                  onRemove={handleRemoveSplit}
                />
              ) : null}
              <SortableQueueRow
                item={item}
                index={sortableOrder.indexOf(key)}
                playbackMode={playbackMode}
              />
            </Fragment>
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
                {splitKey === toCanonicalKey(item) ? (
                  <QueueSplitDivider onRemove={canReorder ? handleRemoveSplit : undefined} />
                ) : null}
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
            if (sid === QUEUE_SPLIT_DIVIDER_ID) {
              return <QueueSplitDivider isDragging />
            }
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

  const showMusicPlayDisabled =
    playbackTogglePending || (spotifyPlaybackState !== "playing" && queue.length === 0)

  const showMusicPlaybackTooltip =
    spotifyPlaybackState === "playing"
      ? "Pause show music playback on Spotify"
      : queue.length === 0
      ? "Nothing in the queue to play"
      : "Resume show music or start the next queued track"

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
            {queueTracksHiddenFromListeners && (
              <Text fontSize="xs" color="fg.muted">
                Hidden from listeners
              </Text>
            )}
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
          <HStack gap={2} justify="end">
            {canResumeOrEmptyControls && (
              <Checkbox.Root
                checked={queueAutoAdvance}
                onCheckedChange={(details) => {
                  handleQueueAutoAdvanceChange(details.checked === true)
                }}
                size="sm"
                title="When off, the next queued track won't start automatically at song end"
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label fontSize="xs">Auto-advance</Checkbox.Label>
              </Checkbox.Root>
            )}
            {canResumeOrEmptyControls && (
              <Tooltip content={showMusicPlaybackTooltip} positioning={{ placement: "top" }}>
                <Box as="span" display="inline-flex">
                  <IconButton
                    aria-label={
                      spotifyPlaybackState === "playing"
                        ? "Pause show music playback"
                        : "Play show music"
                    }
                    variant="outline"
                    colorPalette="primary"
                    size="xs"
                    onClick={handleTogglePlayback}
                    loading={playbackTogglePending}
                    disabled={showMusicPlayDisabled}
                  >
                    {spotifyPlaybackState === "playing" ? <LuPause /> : <LuPlay />}
                  </IconButton>
                </Box>
              </Tooltip>
            )}
            {showAddSplit && (
              <Tooltip content="Add queue split" positioning={{ placement: "top" }}>
                <Button
                  variant="outline"
                  colorPalette="primary"
                  size="xs"
                  onClick={handleAddSplit}
                  aria-label="Add queue split"
                >
                  <LuSquareSplitVertical />
                </Button>
              </Tooltip>
            )}
            <ButtonAddToQueue variant="solid" colorPalette="primary" size="xs" showCount={false} />
          </HStack>
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
