import {
  Box,
  Button,
  VStack,
  Text,
  HStack,
  Badge,
  Icon,
  Timeline,
  Wrap,
  Stack,
  Tag,
} from "@chakra-ui/react"
import { useDragOperation, useDroppable } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { GripVertical, Repeat, Trash2 } from "lucide-react"
import type { ShowSegmentDTO } from "@repo/types"

/** Shared group so timeline rows sort with each other only. */
const SHOW_TIMELINE_SORTABLE_GROUP = "show-timeline"

interface ShowTimelineProps {
  segments: ShowSegmentDTO[]
  onRemove?: (segmentId: string) => void
}

function isSegmentBrowserDragSource(source: { data: unknown } | null | undefined): boolean {
  if (!source || typeof source.data !== "object" || source.data === null) return false
  const d = source.data as { source?: string }
  return d.source === "segment-browser"
}

export function ShowTimeline({ segments, onRemove }: ShowTimelineProps) {
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

  return (
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
        <Timeline.Root gap={0}>
          {segments.map((showSeg, index) => (
            <TimelineItem
              key={showSeg.segmentId}
              showSegment={showSeg}
              index={index}
              onRemove={onRemove}
              segmentBrowserRowHighlight={segmentBrowserRowHighlightId === showSeg.segmentId}
            />
          ))}
        </Timeline.Root>
      )}
    </Box>
  )
}

function TimelineItem({
  showSegment,
  index,
  onRemove,
  segmentBrowserRowHighlight,
}: {
  showSegment: ShowSegmentDTO
  index: number
  onRemove?: (segmentId: string) => void
  segmentBrowserRowHighlight?: boolean
}) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: showSegment.segmentId,
    index,
    group: SHOW_TIMELINE_SORTABLE_GROUP,
  })

  const seg = showSegment.segment
  const rowDropActive = isDropTarget || segmentBrowserRowHighlight

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

      {/* <Timeline.Content width="auto">
        <Text color="fg.muted" fontSize="xs">
          estimated start time here
        </Text>
      </Timeline.Content> */}

      <Timeline.Content>
        <Timeline.Title>
          <HStack gap={2} justify="space-between" w="100%">
            {seg.title}
            {seg.isRecurring && (
              <Icon color="fg.muted" asChild>
                <Repeat size={14} />
              </Icon>
            )}
          </HStack>
        </Timeline.Title>

        <Timeline.Description>
          <Stack gap={2}>
            {seg.description}

            <HStack gap={1}>
              {seg.tags && seg.tags.length > 0 && (
                <Wrap gap={1}>
                  {seg.tags.map((tag) => (
                    <Tag.Root key={tag.id} size="sm" variant="subtle" colorPalette="blue">
                      <Tag.Label>{tag.name}</Tag.Label>
                    </Tag.Root>
                  ))}
                </Wrap>
              )}
            </HStack>
          </Stack>
        </Timeline.Description>
      </Timeline.Content>

      <Timeline.Connector>
        <Timeline.Indicator bg="transparent">
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
