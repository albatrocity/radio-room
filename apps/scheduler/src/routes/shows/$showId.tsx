import { useMemo } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
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
} from "@chakra-ui/react"
import { DragDropProvider, DragOverlay, type DragEndEvent } from "@dnd-kit/react"

type DragEndPayload = Parameters<DragEndEvent>[0]
import { move } from "@dnd-kit/helpers"
import { ArrowLeft } from "lucide-react"
import type { SegmentDTO, ShowStatus } from "@repo/types"
import { useShow, useUpdateShow, useDeleteShow, useReorderShowSegments } from "../../hooks/useShows"
import { ShowTimeline } from "../../components/shows/ShowTimeline"
import { SegmentBrowser } from "../../components/shows/SegmentBrowser"
import { SegmentBrowserCard } from "../../components/shows/SegmentBrowserCard"
import { TagCombobox } from "../../components/tags/TagCombobox"
import { zSearchBoolean, zStringArray } from "../../lib/searchParams"

const showDetailSearchSchema = z.object({
  segSearch: z.string().optional(),
  segTags: zStringArray,
  recurringOnly: zSearchBoolean,
  scheduled: z.enum(["all", "scheduled", "unscheduled"]).optional(),
})

export const Route = createFileRoute("/shows/$showId")({
  validateSearch: zodSearchValidator(showDetailSearchSchema),
  component: ShowDetailPage,
})

const STATUS_OPTIONS: { value: ShowStatus; label: string }[] = [
  { value: "working", label: "Working" },
  { value: "ready", label: "Ready" },
  { value: "published", label: "Published" },
]

const STATUS_COLORS: Record<ShowStatus, string> = {
  working: "yellow",
  ready: "green",
  published: "blue",
}

type BrowserDragData = { segment: SegmentDTO; source: "browser" }

function segmentFromDragSource(source: { data: unknown } | null | undefined): SegmentDTO | undefined {
  if (!source) return undefined
  const data = source.data as BrowserDragData | { segment?: SegmentDTO } | undefined
  return data && "segment" in data ? data.segment : undefined
}

function ShowDetailPage() {
  const { showId } = Route.useParams()
  const { data: show, isLoading } = useShow(showId)
  const updateShow = useUpdateShow()
  const deleteShow = useDeleteShow()
  const reorderSegments = useReorderShowSegments()

  const currentSegmentIds = useMemo(
    () => (show?.segments ?? []).map((s) => s.segmentId),
    [show?.segments],
  )

  function handleRemoveSegment(segmentId: string) {
    const newIds = currentSegmentIds.filter((id) => id !== segmentId)
    reorderSegments.mutate({ showId, segmentIds: newIds })
  }

  function handleDragEnd(event: DragEndPayload) {
    if (!show || event.canceled) return

    const { source, target } = event.operation
    if (!source || !target) return

    const data = source.data as BrowserDragData | Record<string, unknown> | undefined
    const draggedSegment =
      data && typeof data === "object" && "segment" in data
        ? (data as { segment: SegmentDTO }).segment
        : undefined

    // Dropping from browser into timeline
    if (data && "source" in data && data.source === "browser" && String(target.id) === "timeline" && draggedSegment) {
      const newIds = [...currentSegmentIds, draggedSegment.id]
      reorderSegments.mutate({ showId, segmentIds: newIds })
      return
    }

    // Reordering within timeline (sortable items — no browser source tag)
    if (!data || !("source" in data) || data.source !== "browser") {
      const newIds = move(currentSegmentIds, event)
      const orderChanged = newIds.some((id, i) => id !== currentSegmentIds[i])
      if (orderChanged) {
        reorderSegments.mutate({ showId, segmentIds: newIds })
      }
    }
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={8}>
        <Spinner />
      </Box>
    )
  }

  if (!show) {
    return (
      <Box p={8}>
        <Text>Show not found.</Text>
        <Link to="/shows">Back to shows</Link>
      </Box>
    )
  }

  return (
    <Box>
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
          <HStack justify="space-between" mb={2}>
            <Heading size="lg">{show.title}</Heading>
            <Badge colorPalette={STATUS_COLORS[show.status]} size="md">
              {show.status}
            </Badge>
          </HStack>

          <HStack gap={4} mb={4}>
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
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Text fontSize="sm" color="fg.muted">
              {new Date(show.startTime).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {" "}
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
          </HStack>

          {show.description && (
            <Text fontSize="sm" color="fg.muted" mb={4}>
              {show.description}
            </Text>
          )}

          <Box mb={6} maxW="md">
            <TagCombobox
              tagType="show"
              value={(show.tags ?? []).map((t) => t.id)}
              onValueChange={(tagIds) =>
                updateShow.mutate({ id: showId, tagIds })
              }
              disabled={updateShow.isPending}
            />
          </Box>

          <Heading size="md" mb={3}>
            Segments
          </Heading>

          <DragDropProvider onDragEnd={handleDragEnd}>
            <Flex gap={6} direction={{ base: "column", lg: "row" }}>
              <Box flex="1">
                <ShowTimeline
                  segments={show.segments ?? []}
                  onRemove={handleRemoveSegment}
                />
              </Box>
              <Box w={{ base: "100%", lg: "320px" }} flexShrink={0}>
                <SegmentBrowser excludeSegmentIds={currentSegmentIds} />
              </Box>
            </Flex>
            <DragOverlay dropAnimation={null}>
              {(source) => {
                const seg = segmentFromDragSource(source)
                return seg ? <SegmentBrowserCard segment={seg} isDragOverlay /> : null
              }}
            </DragOverlay>
          </DragDropProvider>

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
  )
}
