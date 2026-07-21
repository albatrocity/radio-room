import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  FloatingPanel,
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
import { LuFileText, LuMaximize2, LuMinus, LuSquare, LuX } from "react-icons/lu"
import { fetchRoom } from "../actors/roomActor"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import {
  useAdminSend,
  useCurrentRoom,
  useIsAdmin,
  useRoomScheduleSnapshot,
} from "../hooks/useActors"
import { fetchShow } from "../lib/schedulingApi"
import { toast } from "../lib/toasts"
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

type NotesLoadStatus = "idle" | "loading" | "ready" | "error"

type OpenNotesPanel = {
  segmentId: string
  title: string
  status: Exclude<NotesLoadStatus, "idle">
  markdown: string | null
  error: string | null
  defaultPosition: { x: number; y: number }
}

type SegmentTracksPrompt = {
  showSegmentId: string
  segmentTitle: string
  count: number
  allowTop: boolean
}

type ShowNotesCache = {
  cacheKey: string
  bySegmentId: Map<string, string | null>
}

const PANEL_DEFAULT_SIZE = { width: 360, height: 480 }

function notesBody({
  status,
  markdown,
  error,
  onRetry,
}: {
  status: NotesLoadStatus
  markdown: string | null
  error: string | null
  onRetry: () => void
}) {
  return (
    <>
      {status === "loading" && (
        <HStack py={4}>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading notes…</Text>
        </HStack>
      )}
      {status === "error" && error && (
        <VStack align="stretch" gap={3} py={2}>
          <Text fontSize="sm" color="red.500">
            {error}
          </Text>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </VStack>
      )}
      {status === "ready" &&
        (markdown != null && markdown.trim() !== "" ? (
          <SegmentNotesMarkdown content={markdown} />
        ) : (
          <Text fontSize="sm" color="fg.muted">
            No notes for this segment.
          </Text>
        ))}
    </>
  )
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
  const [pendingShowSegmentId, setPendingShowSegmentId] = useState<string | null>(null)
  const [pendingTitle, setPendingTitle] = useState("")

  const [tracksPrompt, setTracksPrompt] = useState<SegmentTracksPrompt | null>(null)

  // Mobile: single full-screen dialog
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null)
  const [notesStatus, setNotesStatus] = useState<NotesLoadStatus>("idle")
  const [notesMarkdown, setNotesMarkdown] = useState<string | null>(null)
  const [notesError, setNotesError] = useState<string | null>(null)

  // Desktop: independent floating panels
  const [openPanels, setOpenPanels] = useState<OpenNotesPanel[]>([])

  const notesCacheRef = useRef<ShowNotesCache | null>(null)

  const isSmallScreen = useBreakpointValue({ base: true, md: false }) ?? false

  const visible = !!showId && (isAdmin || room?.showSchedulePublic === true)

  useEffect(() => {
    if (!isAdmin || !room?.id) return
    const subscriptionId = `room-schedule-tracks-${room.id}`
    subscribeById(subscriptionId, {
      send: (event) => {
        if (event.type === "SEGMENT_TRACKS_AVAILABLE") {
          setTracksPrompt(event.data as SegmentTracksPrompt)
        }
        if (event.type === "SEGMENT_TRACKS_INJECTED") {
          const data = event.data as { added: number; skipped: number }
          toast({
            title: "Segment tracks added",
            description: `${data.added} added${data.skipped ? `, ${data.skipped} skipped` : ""}`,
            status: "success",
            duration: 4000,
          })
        }
      },
    })
    return () => unsubscribeById(subscriptionId)
  }, [isAdmin, room?.id])

  const activateSegmentImmediate = (ss: ShowSegmentDTO) => {
    adminSend({
      type: "ACTIVATE_SEGMENT",
      data: {
        segmentId: ss.segmentId,
        showSegmentId: ss.id,
        presetMode: "skip",
      },
    })
  }

  const openPresetDialog = (ss: ShowSegmentDTO) => {
    setPendingSegmentId(ss.segmentId)
    setPendingShowSegmentId(ss.id)
    setPendingTitle(ss.segment?.title ?? "")
    setActivateDialogOpen(true)
  }

  const onActivateClick = (ss: ShowSegmentDTO) => {
    const seg = ss.segment
    if (segmentHasSavedPluginPreset(seg)) {
      openPresetDialog(ss)
    } else {
      activateSegmentImmediate(ss)
    }
  }

  const sendActivate = (presetMode: "merge" | "replace" | "skip") => {
    if (!pendingSegmentId) return
    adminSend({
      type: "ACTIVATE_SEGMENT",
      data: {
        segmentId: pendingSegmentId,
        showSegmentId: pendingShowSegmentId ?? undefined,
        presetMode,
      },
    })
    setActivateDialogOpen(false)
    setPendingSegmentId(null)
    setPendingShowSegmentId(null)
    setPendingTitle("")
  }

  const sendInject = (placement: "top" | "bottom") => {
    if (!tracksPrompt) return
    adminSend({
      type: "INJECT_SEGMENT_TRACKS",
      data: { showSegmentId: tracksPrompt.showSegmentId, placement },
    })
    setTracksPrompt(null)
  }

  const fetchNotesMarkdown = useCallback(
    async (segmentId: string, bustCache: boolean): Promise<string | null> => {
      if (!showId || !room?.id) {
        throw new Error("Room or show not available")
      }
      const cacheKey = `${showId}:${scheduleSnapshot?.updatedAt ?? ""}`
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
      return map.get(segmentId) ?? null
    },
    [room?.id, showId, scheduleSnapshot?.updatedAt],
  )

  const closeMobileNotes = useCallback(() => {
    setNotesOpen(false)
    setNotesTarget(null)
    setNotesStatus("idle")
    setNotesMarkdown(null)
    setNotesError(null)
  }, [])

  const loadMobileNotes = useCallback(
    async (target: NotesTarget, bustCache: boolean) => {
      setNotesStatus("loading")
      setNotesError(null)
      setNotesMarkdown(null)
      try {
        const markdown = await fetchNotesMarkdown(target.segmentId, bustCache)
        setNotesMarkdown(markdown)
        setNotesStatus("ready")
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load notes"
        setNotesError(message)
        setNotesStatus("error")
      }
    },
    [fetchNotesMarkdown],
  )

  const updatePanel = useCallback(
    (segmentId: string, patch: Partial<Pick<OpenNotesPanel, "status" | "markdown" | "error">>) => {
      setOpenPanels((prev) =>
        prev.map((panel) => (panel.segmentId === segmentId ? { ...panel, ...patch } : panel)),
      )
    },
    [],
  )

  const loadPanelNotes = useCallback(
    async (segmentId: string, bustCache: boolean) => {
      updatePanel(segmentId, { status: "loading", error: null, markdown: null })
      try {
        const markdown = await fetchNotesMarkdown(segmentId, bustCache)
        updatePanel(segmentId, { status: "ready", markdown, error: null })
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load notes"
        updatePanel(segmentId, { status: "error", error: message, markdown: null })
      }
    },
    [fetchNotesMarkdown, updatePanel],
  )

  const closePanel = useCallback((segmentId: string) => {
    setOpenPanels((prev) => prev.filter((panel) => panel.segmentId !== segmentId))
  }, [])

  const openSegmentNotes = useCallback(
    (segmentId: string, title: string) => {
      if (!showId || !room?.id) return

      if (isSmallScreen) {
        setNotesTarget({ segmentId, title })
        setNotesOpen(true)
        void loadMobileNotes({ segmentId, title }, false)
        return
      }

      if (openPanels.some((panel) => panel.segmentId === segmentId)) {
        return
      }
      setOpenPanels((prev) => {
        if (prev.some((panel) => panel.segmentId === segmentId)) {
          return prev
        }
        const n = prev.length
        return [
          ...prev,
          {
            segmentId,
            title,
            status: "loading",
            markdown: null,
            error: null,
            defaultPosition: { x: 24 + n * 24, y: 80 + n * 24 },
          },
        ]
      })
      void loadPanelNotes(segmentId, false)
    },
    [isSmallScreen, loadMobileNotes, loadPanelNotes, openPanels, room?.id, showId],
  )

  const retryMobileNotes = useCallback(() => {
    if (notesTarget) {
      void loadMobileNotes(notesTarget, true)
    }
  }, [loadMobileNotes, notesTarget])

  if (!visible || !showId) {
    return null
  }

  const segments = show?.segments ?? []
  const startTimes = show ? segmentStartTimes(show.startTime, segments) : []
  const totalMin = totalEstimatedMinutes(segments)
  const waitingForSnapshot = !show && !!showId

  const notesTitle = notesTarget?.title ?? ""

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
                const active = room?.activeShowSegmentId === ss.id
                const notesPanelOpen = isSmallScreen
                  ? notesOpen && notesTarget?.segmentId === ss.segmentId
                  : openPanels.some((panel) => panel.segmentId === ss.segmentId)
                return (
                  <HStack
                    key={ss.id}
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
                      <HStack gap={1} flexShrink={0}>
                        <IconButton
                          size="xs"
                          variant={notesPanelOpen ? "subtle" : "ghost"}
                          aria-label={notesPanelOpen ? "Segment notes open" : "View segment notes"}
                          aria-pressed={notesPanelOpen}
                          onClick={() => {
                            if (notesPanelOpen) {
                              closePanel(ss.segmentId)
                            } else {
                              openSegmentNotes(ss.segmentId, ss.segment?.title ?? "")
                            }
                          }}
                        >
                          <Icon as={LuFileText} />
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
            setPendingShowSegmentId(null)
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

      <DialogRoot
        open={tracksPrompt !== null}
        onOpenChange={(e) => {
          if (!e.open) setTracksPrompt(null)
        }}
        placement="center"
      >
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent>
            <DialogHeader fontWeight="semibold">Add segment tracks to queue?</DialogHeader>
            <DialogCloseTrigger asChild position="absolute" top="2" right="2">
              <CloseButton size="sm" />
            </DialogCloseTrigger>
            <DialogBody>
              <Text fontSize="sm" mb={3}>
                <strong>{tracksPrompt?.segmentTitle}</strong> has {tracksPrompt?.count ?? 0}{" "}
                attached track{(tracksPrompt?.count ?? 0) === 1 ? "" : "s"}.
              </Text>
              <VStack gap={2} align="stretch">
                {tracksPrompt?.allowTop ? (
                  <Button colorPalette="blue" onClick={() => sendInject("top")}>
                    Add to top of queue
                  </Button>
                ) : null}
                <Button
                  colorPalette={tracksPrompt?.allowTop ? undefined : "blue"}
                  variant={tracksPrompt?.allowTop ? "outline" : "solid"}
                  onClick={() => sendInject("bottom")}
                >
                  Add to bottom of queue
                </Button>
                <Button variant="ghost" onClick={() => setTracksPrompt(null)}>
                  Skip
                </Button>
              </VStack>
            </DialogBody>
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>

      {isSmallScreen ? (
        <DialogRoot
          open={notesOpen}
          onOpenChange={(e) => {
            if (!e.open) closeMobileNotes()
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
                {notesBody({
                  status: notesStatus,
                  markdown: notesMarkdown,
                  error: notesError,
                  onRetry: retryMobileNotes,
                })}
              </DialogBody>
              <DialogFooter flexShrink={0}>
                <Button variant="ghost" onClick={closeMobileNotes}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </DialogPositioner>
        </DialogRoot>
      ) : (
        openPanels.map((panel) => (
          <FloatingPanel.Root
            key={panel.segmentId}
            open
            onOpenChange={(e) => {
              if (!e.open) closePanel(panel.segmentId)
            }}
            defaultPosition={panel.defaultPosition}
            defaultSize={PANEL_DEFAULT_SIZE}
            allowOverflow={false}
          >
            <FloatingPanel.Positioner>
              <FloatingPanel.Content>
                <FloatingPanel.Header>
                  <FloatingPanel.DragTrigger>
                    <FloatingPanel.Title>{panel.title || "Segment notes"}</FloatingPanel.Title>
                  </FloatingPanel.DragTrigger>
                  <FloatingPanel.Control>
                    <FloatingPanel.StageTrigger stage="minimized" asChild>
                      <IconButton size="xs" variant="ghost" aria-label="Minimize">
                        <Icon as={LuMinus} />
                      </IconButton>
                    </FloatingPanel.StageTrigger>
                    <FloatingPanel.StageTrigger stage="maximized" asChild>
                      <IconButton size="xs" variant="ghost" aria-label="Maximize">
                        <Icon as={LuMaximize2} />
                      </IconButton>
                    </FloatingPanel.StageTrigger>
                    <FloatingPanel.StageTrigger stage="default" asChild>
                      <IconButton size="xs" variant="ghost" aria-label="Restore">
                        <Icon as={LuSquare} />
                      </IconButton>
                    </FloatingPanel.StageTrigger>
                    <FloatingPanel.CloseTrigger asChild>
                      <IconButton size="xs" variant="ghost" aria-label="Close notes">
                        <Icon as={LuX} />
                      </IconButton>
                    </FloatingPanel.CloseTrigger>
                  </FloatingPanel.Control>
                </FloatingPanel.Header>
                <FloatingPanel.Body>
                  {notesBody({
                    status: panel.status,
                    markdown: panel.markdown,
                    error: panel.error,
                    onRetry: () => void loadPanelNotes(panel.segmentId, true),
                  })}
                </FloatingPanel.Body>
                <FloatingPanel.ResizeTriggers />
              </FloatingPanel.Content>
            </FloatingPanel.Positioner>
          </FloatingPanel.Root>
        ))
      )}
    </Box>
  )
}
