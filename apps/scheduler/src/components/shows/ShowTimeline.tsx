import { useEffect, useState } from "react"
import {
  Box,
  Button,
  VStack,
  Text,
  HStack,
  Icon,
  Timeline,
  Wrap,
  Stack,
  Tag,
  Input,
} from "@chakra-ui/react"
import { SegmentAssigneePicker } from "../segments/SegmentAssigneePicker"
import { useDragOperation, useDroppable } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { GripVertical, Repeat, Trash2 } from "lucide-react"
import type { ShowSegmentDTO } from "@repo/types"
import {
  displayMinutesForInput,
  durationOverrideFromInput,
  formatDurationMinutes,
  segmentStartTimes,
  totalEstimatedMinutes,
} from "../../lib/showDuration"

/** Shared group so timeline rows sort with each other only. */
const SHOW_TIMELINE_SORTABLE_GROUP = "show-timeline"

interface ShowTimelineProps {
  segments: ShowSegmentDTO[]
  showStartTime: string
  onRemove?: (segmentId: string) => void
  onDurationCommit?: (segmentId: string, durationOverride: number | null) => void
}

function isSegmentBrowserDragSource(source: { data: unknown } | null | undefined): boolean {
  if (!source || typeof source.data !== "object" || source.data === null) return false
  const d = source.data as { source?: string }
  return d.source === "segment-browser"
}

export function ShowTimeline({
  segments,
  showStartTime,
  onRemove,
  onDurationCommit,
}: ShowTimelineProps) {
  const { ref, isDropTarget: isTimelineRootDropTarget } = useDroppable({ id: "timeline" })
  const { source, target } = useDragOperation()

  const fromSegmentBrowser = isSegmentBrowserDragSource(source)

  /** True while a segment-browser card is over the timeline root or any timeline row. */
  const segmentBrowserOverTimeline =
    fromSegmentBrowser &&
    target != null &&
    (String(target.id) === "timeline" ||
      (isSortable(target) && target.group === SHOW_TIMELINE_SORTABLE_GROUP))

  /** Row receiving the drop during segment-browser drag (root droppable has no row id). */
  const segmentBrowserRowHighlightId =
    fromSegmentBrowser &&
    target &&
    isSortable(target) &&
    target.group === SHOW_TIMELINE_SORTABLE_GROUP
      ? String(target.id)
      : null

  const listSurfaceActive = isTimelineRootDropTarget || segmentBrowserOverTimeline

  const startTimes = segmentStartTimes(showStartTime, segments)
  const totalMin = totalEstimatedMinutes(segments)

  return (
    <VStack gap={3} align="stretch">
      <Box
        ref={ref}
        bg={listSurfaceActive ? "bg.emphasized" : "transparent"}
        borderRadius="lg"
        p={2}
        minH="200px"
        transition="background 0.15s"
      >
        {segments.length === 0 ? (
          <Box
            p={8}
            textAlign="center"
            color="fg.muted"
            borderWidth="2px"
            borderStyle="dashed"
            borderColor="border.muted"
            borderRadius="lg"
          >
            <Text>Drag segments here to add them to the show</Text>
          </Box>
        ) : (
          <Timeline.Root>
            {segments.map((showSeg, index) => (
              <TimelineItem
                key={showSeg.segmentId}
                showSegment={showSeg}
                index={index}
                estimatedStart={startTimes[index]!}
                onRemove={onRemove}
                onDurationCommit={onDurationCommit}
                segmentBrowserRowHighlight={segmentBrowserRowHighlightId === showSeg.segmentId}
              />
            ))}
          </Timeline.Root>
        )}
      </Box>
      {segments.length > 0 && (
        <Text fontSize="sm" color="fg.muted">
          Estimated show duration (from segment times):{" "}
          <Text as="span" fontWeight="medium" color="fg">
            {formatDurationMinutes(totalMin)}
          </Text>
        </Text>
      )}
    </VStack>
  )
}

function TimelineItem({
  showSegment,
  index,
  estimatedStart,
  onRemove,
  onDurationCommit,
  segmentBrowserRowHighlight,
}: {
  showSegment: ShowSegmentDTO
  index: number
  estimatedStart: Date
  onRemove?: (segmentId: string) => void
  onDurationCommit?: (segmentId: string, durationOverride: number | null) => void
  segmentBrowserRowHighlight?: boolean
}) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: showSegment.segmentId,
    index,
    group: SHOW_TIMELINE_SORTABLE_GROUP,
  })

  const seg = showSegment.segment
  const rowDropActive = isDropTarget || segmentBrowserRowHighlight

  const [durationDraft, setDurationDraft] = useState(() => displayMinutesForInput(showSegment))

  useEffect(() => {
    setDurationDraft(displayMinutesForInput(showSegment))
  }, [showSegment.durationOverride, showSegment.segment.duration, showSegment.segmentId])

  const hasOverride = showSegment.durationOverride !== null

  function commitDuration() {
    if (!onDurationCommit) return
    const next = durationOverrideFromInput(seg.duration ?? null, durationDraft)
    onDurationCommit(showSegment.segmentId, next)
  }

  return (
    <Timeline.Item
      ref={ref}
      opacity={isDragging ? 0.5 : 1}
      borderRadius="md"
      outline={rowDropActive ? "1px solid" : undefined}
      outlineColor={rowDropActive ? "blue.solid" : undefined}
      outlineOffset={rowDropActive ? "2px" : undefined}
      transition="background 0.12s"
    >
      <Timeline.Content width="auto">
        <Box ref={handleRef} cursor="grab" color="fg.muted">
          <GripVertical size={16} />
        </Box>
      </Timeline.Content>

      <Timeline.Connector>
        <Timeline.Separator />
        <Timeline.Indicator>{index + 1}</Timeline.Indicator>
      </Timeline.Connector>

      <Timeline.Content width="auto" minW="72px">
        <Text color="fg.muted" fontSize="xs" fontWeight="medium">
          {estimatedStart.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
        {onDurationCommit && (
          <HStack gap={2} align="center" flexWrap="wrap" mt={1}>
            <HStack gap={1} align="center">
              <Input
                size="2xs"
                maxW="72px"
                type="text"
                inputMode="numeric"
                placeholder="—"
                fontStyle={hasOverride ? "italic" : undefined}
                value={durationDraft}
                onChange={(e) => setDurationDraft(e.target.value)}
                onBlur={commitDuration}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur()
                  }
                }}
              />
              <Text fontSize="xs" color="fg.muted">
                min
              </Text>
            </HStack>
          </HStack>
        )}
      </Timeline.Content>

      <Timeline.Content>
        <Timeline.Title>
          <HStack gap={2} justify="space-between" w="100%" align="center">
            <HStack gap={2} minW={0} flex={1} align="center">
              <SegmentAssigneePicker segment={seg} />
              <Text as="span" lineClamp={1}>
                {seg.title}
              </Text>
            </HStack>
            {seg.isRecurring && (
              <Icon color="fg.muted" asChild flexShrink={0}>
                <Repeat size={14} />
              </Icon>
            )}
          </HStack>
        </Timeline.Title>

        <Timeline.Description>
          <Stack gap={2}>
            {seg.description && seg.description.length > 0 && (
              <Text fontSize="xs" color="fg.muted">
                {seg.description}
              </Text>
            )}

            {seg.tags && seg.tags.length > 0 && (
              <HStack gap={1}>
                <Wrap gap={1}>
                  {seg.tags.map((tag) => (
                    <Tag.Root key={tag.id} size="sm" variant="subtle" colorPalette="blue">
                      <Tag.Label>{tag.name}</Tag.Label>
                    </Tag.Root>
                  ))}
                </Wrap>
              </HStack>
            )}
          </Stack>
        </Timeline.Description>
      </Timeline.Content>

      <Timeline.Connector>
        <Timeline.Indicator bg="transparent" outline="none">
          {onRemove && (
            <Button
              aria-label="Remove segment from show"
              variant="ghost"
              size="xs"
              colorPalette="red"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(showSegment.segmentId)
              }}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </Timeline.Indicator>
      </Timeline.Connector>
    </Timeline.Item>
  )
}
