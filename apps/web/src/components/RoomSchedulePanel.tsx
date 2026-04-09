import { useCallback, useMemo, useRef, useState } from "react"
import {
  Badge,
  Box,
  Button,
  CloseButton,
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  Drawer as ChakraDrawer,
  Heading,
  HStack,
  Icon,
  IconButton,
  Spinner,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import type { ShowSegmentDTO } from "@repo/types"
import { FiFileText } from "react-icons/fi"
import { fetchRoom } from "../actors/roomActor"
import {
  useAdminSend,
  useCurrentRoom,
  useIsAdmin,
  useRoomScheduleSnapshot,
} from "../hooks/useActors"
import { fetchShow } from "../lib/schedulingApi"
import { snapshotToShowDTO } from "../lib/snapshotToShow"
import {
  formatDurationMinutes,
  segmentStartTimes,
  totalEstimatedMinutes,
} from "../lib/showDuration"
import SegmentNotesMarkdown from "./SegmentNotesMarkdown"

function segmentHasSavedPluginPreset(segment: ShowSegmentDTO["segment"] | undefined): boolean {
  if (!segment) return false
  const p = segment.pluginPreset
  if (p == null) return false
  return Object.keys(p.pluginConfigs ?? {}).length > 0
}

type NotesTarget = { segmentId: string; title: string }

type ShowNotesCache = {
  cacheKey: string
  bySegmentId: Map<string, string | null>
}

export default function RoomSchedulePanel() {
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const adminSend = useAdminSend()
  const scheduleSnapshot = useRoomScheduleSnapshot()
  const showId = room?.showId

  const show = useMemo(() => snapshotToShowDTO(scheduleSnapshot), [scheduleSnapshot])

  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [pendingSegmentId, setPendingSegmentId] = useState<string | null>(null)
  const [pendingTitle, setPendingTitle] = useState("")

  const [notesOpen, setNotesOpen] = useState(false)
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null)
  const [notesStatus, setNotesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [notesMarkdown, setNotesMarkdown] = useState<string | null>(null)
  const [notesError, setNotesError] = useState<string | null>(null)

  const notesCacheRef = useRef<ShowNotesCache | null>(null)

  const isSmallScreen = useBreakpointValue({ base: true, md: false }) ?? false

  const visible = !!showId && (isAdmin || room?.showSchedulePublic === true)

  const activateSegmentImmediate = (segmentId: string) => {
    adminSend({
      type: "ACTIVATE_SEGMENT",
      data: { segmentId, presetMode: "skip" },
    })
  }

  const openPresetDialog = (segmentId: string, title: string) => {
    setPendingSegmentId(segmentId)
    setPendingTitle(title)
    setActivateDialogOpen(true)
  }

  const onActivateClick = (ss: ShowSegmentDTO) => {
    const seg = ss.segment
    if (segmentHasSavedPluginPreset(seg)) {
      openPresetDialog(ss.segmentId, seg?.title ?? "")
    } else {
      activateSegmentImmediate(ss.segmentId)
    }
  }

  const sendActivate = (presetMode: "merge" | "replace" | "skip") => {
    if (!pendingSegmentId) return
    adminSend({
      type: "ACTIVATE_SEGMENT",
      data: { segmentId: pendingSegmentId, presetMode },
    })
    setActivateDialogOpen(false)
    setPendingSegmentId(null)
    setPendingTitle("")
  }

  const closeNotes = useCallback(() => {
    setNotesOpen(false)
    setNotesTarget(null)
    setNotesStatus("idle")
    setNotesMarkdown(null)
    setNotesError(null)
  }, [])

  const loadNotesForTarget = useCallback(
    async (target: NotesTarget, bustCache: boolean) => {
      if (!showId || !room?.id) return
      setNotesStatus("loading")
      setNotesError(null)
      setNotesMarkdown(null)
      const cacheKey = `${showId}:${scheduleSnapshot?.updatedAt ?? ""}`
      try {
        if (bustCache) {
          notesCacheRef.current = null
        }
        let map =
          notesCacheRef.current?.cacheKey === cacheKey ? notesCacheRef.current.bySegmentId : null
        if (!map) {
          const dto = await fetchShow(showId, { roomId: room.id })
          map = new Map<string, string | null>()
          for (const ss of dto.segments ?? []) {
            map.set(ss.segmentId, ss.segment?.description ?? null)
          }
          notesCacheRef.current = { cacheKey, bySegmentId: map }
        }
        setNotesMarkdown(map.get(target.segmentId) ?? null)
        setNotesStatus("ready")
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load notes"
        setNotesError(message)
        setNotesStatus("error")
      }
    },
    [room?.id, showId, scheduleSnapshot?.updatedAt],
  )

  const openSegmentNotes = useCallback(
    (segmentId: string, title: string) => {
      if (!showId || !room?.id) return
      setNotesTarget({ segmentId, title })
      setNotesOpen(true)
      void loadNotesForTarget({ segmentId, title }, false)
    },
    [loadNotesForTarget, room?.id, showId],
  )

  const retryNotes = useCallback(() => {
    if (notesTarget) {
      void loadNotesForTarget(notesTarget, true)
    }
  }, [loadNotesForTarget, notesTarget])

  if (!visible || !showId) {
    return null
  }

  const segments = show?.segments ?? []
  const startTimes = show ? segmentStartTimes(show.startTime, segments) : []
  const totalMin = totalEstimatedMinutes(segments)
  const waitingForSnapshot = !show && !!showId

  const notesTitle = notesTarget?.title ?? ""

  const notesBodyInner = (
    <>
      {notesStatus === "loading" && (
        <HStack py={4}>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading notes…</Text>
        </HStack>
      )}
      {notesStatus === "error" && notesError && (
        <VStack align="stretch" gap={3} py={2}>
          <Text fontSize="sm" color="red.500">
            {notesError}
          </Text>
          <Button size="sm" variant="outline" onClick={retryNotes}>
            Retry
          </Button>
        </VStack>
      )}
      {notesStatus === "ready" &&
        (notesMarkdown != null && notesMarkdown.trim() !== "" ? (
          <SegmentNotesMarkdown content={notesMarkdown} />
        ) : (
          <Text fontSize="sm" color="fg.muted">
            No notes for this segment.
          </Text>
        ))}
    </>
  )

  return (
    <Box px={4} py={3} borderBottomWidth={1} borderBottomColor="secondaryBorder" w="100%">
      <VStack align="stretch" gap={2}>
        <HStack justify="space-between">
          <Heading as="h3" size="sm">
            Show schedule
          </Heading>
          {isAdmin && room?.id && (
            <Button size="xs" variant="ghost" onClick={() => fetchRoom(room.id)}>
              Refresh
            </Button>
          )}
        </HStack>
        {waitingForSnapshot && (
          <HStack>
            <Spinner size="sm" />
            <Text fontSize="sm">Loading schedule…</Text>
          </HStack>
        )}
        {show && (
          <>
            <Text fontSize="xs" color="gray.500">
              {show.title} · {formatDurationMinutes(totalMin)} estimated
            </Text>
            <VStack align="stretch" gap={1} maxH="220px" overflowY="auto">
              {segments.map((ss, i) => {
                const active = room?.activeSegmentId === ss.segmentId
                return (
                  <HStack
                    key={ss.segmentId}
                    justify="space-between"
                    gap={2}
                    py={1}
                    borderBottomWidth="1px"
                    borderColor="border.muted"
                    fontSize="sm"
                  >
                    <VStack align="start" gap={0} minW={0} flex={1}>
                      <HStack gap={1}>
                        <Text fontWeight="medium" fontSize="xs" color="fg.muted">
                          {startTimes[i]?.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                        {active && (
                          <Badge size="sm" colorPalette="green">
                            Active
                          </Badge>
                        )}
                      </HStack>
                      <Text lineClamp={2}>{ss.segment?.title ?? ""}</Text>
                    </VStack>
                    {isAdmin && (
                      <HStack gap={1} shrink={0}>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          aria-label="View segment notes"
                          onClick={() => openSegmentNotes(ss.segmentId, ss.segment?.title ?? "")}
                        >
                          <Icon as={FiFileText} />
                        </IconButton>
                        <Button size="xs" variant="outline" onClick={() => onActivateClick(ss)}>
                          Activate
                        </Button>
                      </HStack>
                    )}
                  </HStack>
                )
              })}
            </VStack>
          </>
        )}
      </VStack>

      <DialogRoot
        open={activateDialogOpen}
        onOpenChange={(e) => {
          if (!e.open) {
            setActivateDialogOpen(false)
            setPendingSegmentId(null)
            setPendingTitle("")
          }
        }}
        placement="center"
      >
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent>
            <DialogHeader fontWeight="semibold">Activate segment</DialogHeader>
            <DialogCloseTrigger asChild position="absolute" top="2" right="2">
              <CloseButton size="sm" />
            </DialogCloseTrigger>
            <DialogBody>
              <Text fontSize="sm" mb={3}>
                <strong>{pendingTitle}</strong>
              </Text>
              <Text fontSize="sm" color="fg.muted" mb={3}>
                Apply this segment&apos;s plugin preset? Any room setting overrides saved on the
                segment are applied automatically when you activate (no extra step).
              </Text>
              <VStack gap={2} align="stretch">
                <Button colorPalette="blue" onClick={() => sendActivate("merge")}>
                  Merge preset into current plugins
                </Button>
                <Button variant="outline" onClick={() => sendActivate("replace")}>
                  Replace all plugin configs with preset
                </Button>
                <Button variant="ghost" onClick={() => sendActivate("skip")}>
                  Don&apos;t change plugin settings
                </Button>
              </VStack>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setActivateDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>

      {isSmallScreen ? (
        <DialogRoot
          open={notesOpen}
          onOpenChange={(e) => {
            if (!e.open) closeNotes()
          }}
          placement="center"
        >
          <DialogBackdrop />
          <DialogPositioner alignItems="stretch" justifyContent="stretch" p={0}>
            <DialogContent
              maxW="100vw"
              w="100%"
              minH="100dvh"
              m={0}
              rounded="none"
              display="flex"
              flexDirection="column"
            >
              <DialogHeader fontWeight="semibold" flexShrink={0}>
                Segment notes
              </DialogHeader>
              <DialogCloseTrigger asChild position="absolute" top="2" right="2">
                <CloseButton size="sm" />
              </DialogCloseTrigger>
              <DialogBody flex="1" overflowY="auto">
                <Heading as="h2" size="sm" mb={3}>
                  {notesTitle}
                </Heading>
                {notesBodyInner}
              </DialogBody>
              <DialogFooter flexShrink={0}>
                <Button variant="ghost" onClick={closeNotes}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </DialogPositioner>
        </DialogRoot>
      ) : (
        <ChakraDrawer.Root
          open={notesOpen}
          onOpenChange={(e) => {
            if (!e.open) closeNotes()
          }}
          placement="start"
          modal={false}
          preventScroll={false}
          closeOnInteractOutside
        >
          <ChakraDrawer.Positioner>
            <ChakraDrawer.Content maxW="md" minW="280px">
              <ChakraDrawer.Header>
                <ChakraDrawer.Title>Segment notes</ChakraDrawer.Title>
                <ChakraDrawer.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDrawer.CloseTrigger>
              </ChakraDrawer.Header>
              <ChakraDrawer.Body flex="1" overflowY="auto">
                <Heading as="h2" size="sm" mb={3}>
                  {notesTitle}
                </Heading>
                {notesBodyInner}
              </ChakraDrawer.Body>
            </ChakraDrawer.Content>
          </ChakraDrawer.Positioner>
        </ChakraDrawer.Root>
      )}
    </Box>
  )
}
