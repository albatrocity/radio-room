import { useCallback, useEffect, useState } from "react"
import {
  Badge,
  Box,
  Button,
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  HStack,
  Heading,
  CloseButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { ShowDTO, ShowSegmentDTO } from "@repo/types"
import { useAdminSend, useCurrentRoom, useIsAdmin } from "../hooks/useActors"
import { fetchShow } from "../lib/schedulingApi"
import {
  formatDurationMinutes,
  segmentStartTimes,
  totalEstimatedMinutes,
} from "../lib/showDuration"

function segmentHasSavedPluginPreset(segment: ShowSegmentDTO["segment"]): boolean {
  const p = segment.pluginPreset
  if (p == null) return false
  return Object.keys(p.pluginConfigs ?? {}).length > 0
}

export default function RoomSchedulePanel() {
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const adminSend = useAdminSend()
  const showId = room?.showId

  const [show, setShow] = useState<ShowDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingSegmentId, setPendingSegmentId] = useState<string | null>(null)
  const [pendingTitle, setPendingTitle] = useState("")

  const visible = !!showId && (isAdmin || room?.showSchedulePublic === true)

  const loadShow = useCallback(async () => {
    if (!showId || !room?.id) return
    setLoading(true)
    setError(null)
    try {
      const s = await fetchShow(showId, { roomId: room.id })
      setShow(s)
    } catch {
      setError("Could not load show schedule.")
      setShow(null)
    } finally {
      setLoading(false)
    }
  }, [showId, room?.id])

  useEffect(() => {
    if (!visible || !showId) {
      setShow(null)
      return
    }
    loadShow()
  }, [visible, showId, loadShow])

  const activateSegmentImmediate = (segmentId: string) => {
    adminSend({
      type: "ACTIVATE_SEGMENT",
      data: { segmentId, presetMode: "skip" },
    })
  }

  const openPresetDialog = (segmentId: string, title: string) => {
    setPendingSegmentId(segmentId)
    setPendingTitle(title)
    setDialogOpen(true)
  }

  const onActivateClick = (ss: ShowSegmentDTO) => {
    if (segmentHasSavedPluginPreset(ss.segment)) {
      openPresetDialog(ss.segmentId, ss.segment.title)
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
    setDialogOpen(false)
    setPendingSegmentId(null)
    setPendingTitle("")
  }

  if (!visible || !showId) {
    return null
  }

  const segments = show?.segments ?? []
  const startTimes = show ? segmentStartTimes(show.startTime, segments) : []
  const totalMin = totalEstimatedMinutes(segments)

  return (
    <Box px={4} py={3} borderBottomWidth={1} borderBottomColor="secondaryBorder" w="100%">
      <VStack align="stretch" gap={2}>
        <HStack justify="space-between">
          <Heading as="h3" size="sm">
            Show schedule
          </Heading>
          {isAdmin && (
            <Button size="xs" variant="ghost" onClick={() => loadShow()}>
              Refresh
            </Button>
          )}
        </HStack>
        {loading && (
          <HStack>
            <Spinner size="sm" />
            <Text fontSize="sm">Loading…</Text>
          </HStack>
        )}
        {error && (
          <Text fontSize="sm" color="red.500">
            {error}
          </Text>
        )}
        {!loading && show && (
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
                      <Text lineClamp={2}>{ss.segment.title}</Text>
                    </VStack>
                    {isAdmin && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onActivateClick(ss)}
                      >
                        Activate
                      </Button>
                    )}
                  </HStack>
                )
              })}
            </VStack>
          </>
        )}
      </VStack>

      <DialogRoot
        open={dialogOpen}
        onOpenChange={(e) => {
          if (!e.open) {
            setDialogOpen(false)
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
                Apply this segment&apos;s plugin preset?
              </Text>
              <VStack gap={2} align="stretch">
                <Button
                  colorPalette="blue"
                  onClick={() => sendActivate("merge")}
                >
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
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>
    </Box>
  )
}
