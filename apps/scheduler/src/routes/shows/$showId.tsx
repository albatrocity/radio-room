import { useCallback, useMemo } from "react"
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { z } from "zod"
import { zodSearchValidator } from "@tanstack/router-zod-adapter"
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Text,
  Badge,
  Spinner,
  AbsoluteCenter,
} from "@chakra-ui/react"
import { DragDropProvider, DragOverlay, type DragEndEvent } from "@dnd-kit/react"
import { isSortable } from "@dnd-kit/react/sortable"
import { move } from "@dnd-kit/helpers"

type DragEndPayload = Parameters<DragEndEvent>[0]
import { ArrowLeft } from "lucide-react"
import type { SegmentDTO, ShowStatus } from "@repo/types"
import {
  useShow,
  useUpdateShow,
  useDeleteShow,
  useReorderShowSegments,
  useUpdateShowSegmentDuration,
} from "../../hooks/useShows"
import { useSyncPublishPlaylist } from "../../hooks/usePublishShow"
import { formatDurationMinutes, totalEstimatedMinutes } from "../../lib/showDuration"
import { ShowTimeline } from "../../components/shows/ShowTimeline"
import { SegmentBrowser } from "../../components/shows/SegmentBrowser"
import { SegmentBrowserCard } from "../../components/shows/SegmentBrowserCard"
import { StreamingPlaylistButtons } from "../../components/shows/StreamingPlaylistButtons"
import { TagCombobox } from "../../components/tags/TagCombobox"
import { zSearchBoolean, zStringArray } from "../../lib/searchParams"
import { PageContent } from "../../components/layout/PageContent"

const showDetailSearchSchema = z.object({
  segSearch: z.string().optional(),
  segTags: zStringArray,
  recurringOnly: zSearchBoolean,
  scheduled: z.enum(["all", "scheduled", "unscheduled"]).optional(),
  segStatus: z.enum(["draft", "ready", "archived"]).optional(),
})

export const Route = createFileRoute("/shows/$showId")({
  validateSearch: zodSearchValidator(showDetailSearchSchema),
  component: ShowDetailPage,
})

/** Manual status changes only; `published` is set by the publish finalize flow. */
const STATUS_OPTIONS_EDITABLE: { value: ShowStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
]

const STATUS_COLORS: Record<ShowStatus, string> = {
  draft: "yellow",
  ready: "green",
  published: "blue",
}

/** Drag payload from {@link SegmentBrowserCard} (segment list panel). */
type SegmentBrowserDragData = { segment: SegmentDTO; source: "segment-browser" }

function segmentFromDragSource(
  source: { data: unknown } | null | undefined,
): SegmentDTO | undefined {
  if (!source) return undefined
  const data = source.data as SegmentBrowserDragData | { segment?: SegmentDTO } | undefined
  return data && "segment" in data ? data.segment : undefined
}

function ShowDetailPage() {
  const { showId } = Route.useParams()
  const isPublishRoute = useRouterState({
    select: (s) => s.location.pathname.includes("/publish"),
  })

  const { data: show, isLoading } = useShow(showId)
  const updateShow = useUpdateShow()
  const deleteShow = useDeleteShow()
  const reorderSegments = useReorderShowSegments()
  const { mutate: mutateSegmentDuration } = useUpdateShowSegmentDuration()
  const syncPublish = useSyncPublishPlaylist(showId)
  const navigate = useNavigate()

  const currentSegmentIds = useMemo(
    () => (show?.segments ?? []).map((s) => s.segmentId),
    [show?.segments],
  )

  function handleRemoveSegment(segmentId: string) {
    const newIds = currentSegmentIds.filter((id) => id !== segmentId)
    reorderSegments.mutate({ showId, segmentIds: newIds })
  }

  function handleAddSegmentToShowEnd(segmentId: string) {
    if (currentSegmentIds.includes(segmentId)) return
    reorderSegments.mutate({
      showId,
      segmentIds: [...currentSegmentIds, segmentId],
    })
  }

  const handleDurationCommit = useCallback(
    (segmentId: string, durationOverride: number | null) => {
      mutateSegmentDuration({ showId, segmentId, durationOverride })
    },
    [showId, mutateSegmentDuration],
  )

  const estimatedTotalMinutes = useMemo(
    () => totalEstimatedMinutes(show?.segments ?? []),
    [show?.segments],
  )

  function handleDragEnd(event: DragEndPayload) {
    if (!show || event.canceled) return

    const { source, target } = event.operation
    if (!source || !target) return

    const data = source.data as SegmentBrowserDragData | Record<string, unknown> | undefined
    const draggedSegment =
      data && typeof data === "object" && "segment" in data
        ? (data as { segment: SegmentDTO }).segment
        : undefined

    // Drag from segment browser list → timeline (empty list: root droppable; with rows: sortable targets)
    if (data && "source" in data && data.source === "segment-browser" && draggedSegment) {
      if (currentSegmentIds.includes(draggedSegment.id)) return

      if (String(target.id) === "timeline") {
        reorderSegments.mutate({
          showId,
          segmentIds: [...currentSegmentIds, draggedSegment.id],
        })
        return
      }

      if (isSortable(target)) {
        let insertIndex = target.index
        const targetShape = target.shape
        const pointer = event.operation.position.current
        if (targetShape?.center && pointer) {
          const belowRow = Math.round(pointer.y) > Math.round(targetShape.center.y)
          if (belowRow) insertIndex += 1
        }
        insertIndex = Math.max(0, Math.min(insertIndex, currentSegmentIds.length))
        const newIds = [...currentSegmentIds]
        newIds.splice(insertIndex, 0, draggedSegment.id)
        reorderSegments.mutate({ showId, segmentIds: newIds })
      }
      return
    }

    // Reordering within timeline (sortable items — not a segment-browser list drag)
    if (!data || !("source" in data) || data.source !== "segment-browser") {
      const newIds = move(currentSegmentIds, event)
      const orderChanged = newIds.some((id, i) => id !== currentSegmentIds[i])
      if (orderChanged) {
        reorderSegments.mutate({ showId, segmentIds: newIds })
      }
    }
  }

  if (isPublishRoute) {
    return <Outlet />
  }

  if (isLoading) {
    return (
      <PageContent>
        <AbsoluteCenter>
          <Spinner />
        </AbsoluteCenter>
      </PageContent>
    )
  }

  if (!show) {
    return (
      <PageContent>
        <Box p={8} flex="1" minH="0" overflow="auto">
          <Text>Show not found.</Text>
          <Link to="/shows">Back to shows</Link>
        </Box>
      </PageContent>
    )
  }

  const isPublished = show.status === "published"
  const canPreparePublish = !isPublished && show.status === "ready"

  return (
    <PageContent>
      <Box flex="1" minH="0" overflow="auto">
        <HStack mb={4}>
          <Link to="/shows">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} />
              Shows
            </Button>
          </Link>
        </HStack>

        <Flex gap={6} direction={{ base: "column", lg: "row" }}>
          {/* Left: Show info + timeline */}
          <Box flex="1">
            <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
              <Heading size="lg">{show.title}</Heading>
              <HStack gap={2} flexWrap="wrap">
                <Badge colorPalette={STATUS_COLORS[show.status]} size="md">
                  {show.status}
                </Badge>
                {canPreparePublish && (
                  <Button
                    size="xs"
                    loading={syncPublish.isPending}
                    onClick={() =>
                      syncPublish.mutate(undefined, {
                        onSuccess: (data) => {
                          navigate({
                            to: "/shows/$showId/publish/playlist",
                            params: { showId },
                            state: { playlistItems: data.playlistItems } as {
                              playlistItems: typeof data.playlistItems
                            },
                          })
                        },
                      })
                    }
                  >
                    Publish…
                  </Button>
                )}
                {isPublished && (
                  <Link to="/shows/$showId/publish" params={{ showId }}>
                    <Button size="sm" variant="outline">
                      Edit archive
                    </Button>
                  </Link>
                )}
              </HStack>
            </HStack>

            <HStack gap={4} mb={4} flexWrap="wrap" align="flex-start">
              {!isPublished ? (
                <select
                  value={show.status}
                  onChange={(e) =>
                    updateShow.mutate({ id: showId, status: e.target.value as ShowStatus })
                  }
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--chakra-colors-border-muted)",
                    background: "var(--chakra-colors-bg-panel)",
                    color: "inherit",
                    fontSize: "14px",
                  }}
                >
                  {STATUS_OPTIONS_EDITABLE.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Text fontSize="sm" fontWeight="medium" color="fg.muted">
                  This show is published. Timeline and segments are read-only.
                </Text>
              )}
              <Text fontSize="sm" color="fg.muted">
                {new Date(show.startTime).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                {new Date(show.startTime).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {show.endTime && (
                  <>
                    {" - "}
                    {new Date(show.endTime).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </>
                )}
              </Text>
              <Text fontSize="sm" color="fg.muted">
                Estimated from segments:{" "}
                <Text as="span" fontWeight="medium" color="fg">
                  {formatDurationMinutes(estimatedTotalMinutes)}
                </Text>
              </Text>
            </HStack>

            {canPreparePublish && !show.roomId && (
              <Text fontSize="xs" color="fg.muted" mb={3} maxW="lg">
                No listening room is linked in scheduling yet (Postgres{" "}
                <Text as="span" fontFamily="mono">
                  show.room_id
                </Text>{" "}
                is empty). Sync playlist will still try to find a room in Redis that has this show
                attached. Re-save room settings with the show attached, or create the room with this
                show, to set the link.
              </Text>
            )}

            {show.description && (
              <Text fontSize="sm" color="fg.muted" mb={4}>
                {show.description}
              </Text>
            )}

            <Box mb={6} maxW="md">
              <TagCombobox
                tagType="show"
                value={(show.tags ?? []).map((t) => t.id)}
                onValueChange={(tagIds) => updateShow.mutate({ id: showId, tagIds })}
                disabled={updateShow.isPending || isPublished}
              />
            </Box>

            {isPublished && show.roomExport && (
              <Box
                mb={6}
                p={4}
                borderWidth="1px"
                borderRadius="md"
                borderColor="border.muted"
                bg="bg.subtle"
              >
                <Heading size="sm" mb={2}>
                  Room archive
                </Heading>
                <StreamingPlaylistButtons playlistLinks={show.roomExport.playlistLinks} />
                <Text fontSize="xs" color="fg.muted" whiteSpace="pre-wrap" lineClamp={12} mb={3}>
                  {show.roomExport.markdown}
                </Text>
                <Link to="/shows/$showId/publish" params={{ showId }}>
                  <Button size="xs" variant="outline">
                    Open in editor
                  </Button>
                </Link>
              </Box>
            )}

            <Heading size="md" mb={3}>
              Segments
            </Heading>

            {isPublished ? (
              <ShowTimeline
                readOnly
                segments={show.segments ?? []}
                showStartTime={show.startTime}
              />
            ) : (
              <DragDropProvider onDragEnd={handleDragEnd}>
                <Flex gap={6} direction={{ base: "column", lg: "row" }}>
                  <Box flex="1">
                    <ShowTimeline
                      segments={show.segments ?? []}
                      showStartTime={show.startTime}
                      onRemove={handleRemoveSegment}
                      onDurationCommit={handleDurationCommit}
                    />
                  </Box>
                  <Box w={{ base: "100%", lg: "320px" }} flexShrink={0}>
                    <SegmentBrowser
                      excludeSegmentIds={currentSegmentIds}
                      onAddSegmentToShowEnd={handleAddSegmentToShowEnd}
                      isAddToShowPending={reorderSegments.isPending}
                    />
                  </Box>
                </Flex>
                <DragOverlay dropAnimation={null}>
                  {(source) => {
                    const seg = segmentFromDragSource(source)
                    return seg ? <SegmentBrowserCard segment={seg} isDragOverlay /> : null
                  }}
                </DragOverlay>
              </DragDropProvider>
            )}

            <Box mt={8}>
              <Button
                variant="outline"
                colorPalette="red"
                size="sm"
                onClick={async () => {
                  await deleteShow.mutateAsync(showId)
                  window.location.href = "/shows"
                }}
                loading={deleteShow.isPending}
              >
                Delete Show
              </Button>
            </Box>
          </Box>
        </Flex>
      </Box>
    </PageContent>
  )
}
