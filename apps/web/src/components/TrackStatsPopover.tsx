import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Box,
  Button,
  CloseButton,
  HStack,
  Popover,
  Portal,
  Skeleton,
  Stack,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { differenceInDays, format, parseISO } from "date-fns"
import type { TrackStatsDTO } from "@repo/types"
import type { QueueItem } from "@repo/types/Queue"
import { fetchTrackStats } from "../lib/serverApi"
import { trackStatsIdsFromQueueItem } from "../lib/trackStatsIds"
import { toast } from "../lib/toasts"

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; stats: TrackStatsDTO }
  | { status: "error"; message: string }

type Props = {
  roomId: string | undefined
  item: QueueItem
  trackTitle: string
  children: ReactNode
}

function StatsDateSummary({ stats }: { stats: TrackStatsDTO }) {
  if (stats.firstPlay) {
    return null
  }

  const lastAt = stats.recentAppearances[0]?.addedAt
  const firstAt = stats.firstAppearance?.addedAt

  if (stats.appearanceCount === 1) {
    const when = lastAt ?? firstAt
    if (!when) {
      return null
    }
    return (
      <Text fontSize="xs" color="fg.muted">
        {format(parseISO(when), "PP")}
      </Text>
    )
  }

  if (!firstAt || !lastAt) {
    return null
  }

  const daysSinceLast = differenceInDays(new Date(), parseISO(lastAt))

  return (
    <HStack gap={3} flexWrap="wrap" fontSize="xs" color="fg.muted">
      <Text>First: {format(parseISO(firstAt), "PP")}</Text>
      <Text>
        Last:{" "}
        {daysSinceLast === 0
          ? "today"
          : `${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago`}
      </Text>
    </HStack>
  )
}

export default function TrackStatsPopover({ roomId, item, trackTitle, children }: Props) {
  const [open, setOpen] = useState(false)
  const identity = useMemo(() => trackStatsIdsFromQueueItem(item), [item])
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" })

  const loadStats = useCallback(async () => {
    if (!roomId || !identity) {
      setFetchState({ status: "error", message: "Track identity unavailable" })
      return
    }
    setFetchState({ status: "loading" })
    try {
      const stats = await fetchTrackStats(roomId, identity)
      setFetchState({ status: "success", stats })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load track stats"
      setFetchState({ status: "error", message })
      toast({
        title: "Track stats unavailable",
        description: message,
        type: "error",
        duration: 4000,
      })
    }
  }, [identity, roomId])

  useEffect(() => {
    if (!open) {
      setFetchState({ status: "idle" })
      return
    }
    void loadStats()
  }, [open, loadStats])

  const stats = fetchState.status === "success" ? fetchState.stats : null

  return (
    <Popover.Root
      lazyMount
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      autoFocus={false}
      positioning={{
        strategy: "fixed",
        placement: "top-start",
        flip: true,
        slide: true,
        fitViewport: true,
        overflowPadding: 12,
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Portal>
        <Popover.Positioner zIndex="modal">
          <Popover.Content
            bg="appBg"
            color="fg"
            borderWidth="1px"
            borderColor="border"
            shadow="lg"
            overflow="visible"
            css={{ "--popover-bg": "{colors.appBg}" }}
            minW="min(380px, 92vw)"
            maxW="92vw"
          >
            <Popover.Arrow css={{ "--arrow-bg": "{colors.appBg}", "--arrow-size": "10px" }}>
              <Popover.ArrowTip />
            </Popover.Arrow>
            <Popover.CloseTrigger asChild position="absolute" top="1" right="1" zIndex={1}>
              <CloseButton size="sm" />
            </Popover.CloseTrigger>
            <Popover.Header fontSize="md" fontWeight="bold" pr={8} bg="appBg">
              {trackTitle}
            </Popover.Header>
            <Popover.Body pt={0} bg="appBg" px={0} pb={0}>
              <Box maxH="min(420px, 70vh)" overflowY="auto" px={4} pb={4}>
              {fetchState.status === "loading" || fetchState.status === "idle" ? (
                <VStack align="stretch" gap={3}>
                  <Skeleton height="5" />
                  <Skeleton height="4" width="70%" />
                  <Skeleton height="24" />
                </VStack>
              ) : fetchState.status === "error" ? (
                <Stack gap={3}>
                  <Text color="fg.muted" fontSize="sm">
                    {fetchState.message}
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    alignSelf="flex-start"
                    onClick={() => void loadStats()}
                  >
                    Retry
                  </Button>
                </Stack>
              ) : stats ? (
                <Stack gap={3} py={2}>
                  <Text fontWeight="semibold" fontSize="sm">
                    {stats.firstPlay
                      ? "This is the first time this track has been played in the Listening Room!"
                      : `Played on ${stats.showCount} previous show${
                          stats.showCount === 1 ? "" : "s"
                        }`}
                  </Text>

                  <StatsDateSummary stats={stats} />

                  {stats.firstPlay ? (
                    <Text fontSize="xs" color="fg.muted">
                      No history to show for this track.
                    </Text>
                  ) : (
                    <Table.Root size="sm" variant="outline">
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeader>Show</Table.ColumnHeader>
                          <Table.ColumnHeader>DJ</Table.ColumnHeader>
                          <Table.ColumnHeader textAlign="end">When</Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {stats.recentAppearances.map((row) => (
                          <Table.Row key={`${row.showTitle}-${row.addedAt}`}>
                            <Table.Cell maxW="10rem" truncate title={row.showTitle}>
                              {row.showTitle}
                            </Table.Cell>
                            <Table.Cell maxW="7rem" truncate title={row.addedByUsername}>
                              {row.addedByUsername}
                            </Table.Cell>
                            <Table.Cell textAlign="end" whiteSpace="nowrap" fontSize="xs">
                              {format(parseISO(row.addedAt), "PP p")}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  )}
                </Stack>
              ) : null}
              </Box>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}
