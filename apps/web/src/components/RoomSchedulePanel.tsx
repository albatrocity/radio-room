import { useMemo, useState } from "react"
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
import type { ShowSegmentDTO } from "@repo/types"
import { fetchRoom } from "../actors/roomActor"
import { useAdminSend, useCurrentRoom, useIsAdmin, useRoomScheduleSnapshot } from "../hooks/useActors"
import { snapshotToShowDTO } from "../lib/snapshotToShow"
import {
  formatDurationMinutes,
  segmentStartTimes,
  totalEstimatedMinutes,
} from "../lib/showDuration"

function segmentHasSavedPluginPreset(segment: ShowSegmentDTO["segment"] | undefined): boolean {
  if (!segment) return false
  const p = segment.pluginPreset
  if (p == null) return false
  return Object.keys(p.pluginConfigs ?? {}).length > 0
}

export default function RoomSchedulePanel() {
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const adminSend = useAdminSend()
  const scheduleSnapshot = useRoomScheduleSnapshot()
  const showId = room?.showId

  const show = useMemo(() => snapshotToShowDTO(scheduleSnapshot), [scheduleSnapshot])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingSegmentId, setPendingSegmentId] = useState<string | null>(null)
  const [pendingTitle, setPendingTitle] = useState("")

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
    setDialogOpen(true)
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
  const waitingForSnapshot = !show && !!showId

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
                Apply this segment&apos;s plugin preset? Any room setting overrides saved on the segment
                are applied automatically when you activate (no extra step).
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
