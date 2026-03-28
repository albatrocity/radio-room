import { Box, Button, VStack, Text, HStack, Badge, Icon } from "@chakra-ui/react"
import { useDroppable } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { GripVertical, Repeat, Trash2 } from "lucide-react"
import type { ShowSegmentDTO } from "@repo/types"

/** Shared group so timeline rows sort with each other only. */
const SHOW_TIMELINE_SORTABLE_GROUP = "show-timeline"

interface ShowTimelineProps {
  segments: ShowSegmentDTO[]
  onRemove?: (segmentId: string) => void
}

export function ShowTimeline({ segments, onRemove }: ShowTimelineProps) {
  const { ref, isDropTarget } = useDroppable({ id: "timeline" })

  return (
    <Box
      ref={ref}
      bg={isDropTarget ? "bg.emphasized" : "transparent"}
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
        <VStack gap={0} align="stretch">
          {segments.map((showSeg, index) => (
            <TimelineItem
              key={showSeg.segmentId}
              showSegment={showSeg}
              index={index}
              onRemove={onRemove}
            />
          ))}
        </VStack>
      )}
    </Box>
  )
}

function TimelineItem({
  showSegment,
  index,
  onRemove,
}: {
  showSegment: ShowSegmentDTO
  index: number
  onRemove?: (segmentId: string) => void
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: showSegment.segmentId,
    index,
    group: SHOW_TIMELINE_SORTABLE_GROUP,
  })

  const seg = showSegment.segment

  return (
    <Box ref={ref} opacity={isDragging ? 0.5 : 1}>
      <HStack gap={0}>
        {/* Timeline gutter */}
        <Box
          w="40px"
          display="flex"
          flexDirection="column"
          alignItems="center"
          flexShrink={0}
        >
          <Box
            w="24px"
            h="24px"
            borderRadius="full"
            bg="blue.solid"
            color="white"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
            fontWeight="bold"
          >
            {index + 1}
          </Box>
          <Box w="2px" flex="1" bg="border.muted" minH="20px" />
        </Box>

        {/* Segment card */}
        <Box
          flex="1"
          borderWidth="1px"
          borderColor="border.muted"
          borderRadius="md"
          p={3}
          mb={2}
          bg="bg.panel"
          _hover={{ borderColor: "border.emphasized" }}
        >
          <HStack justify="space-between">
            <HStack gap={2}>
              <Box ref={handleRef} cursor="grab" color="fg.muted">
                <GripVertical size={16} />
              </Box>
              <Text fontWeight="medium" fontSize="sm">
                {seg.title}
              </Text>
              {seg.isRecurring && (
                <Icon color="fg.muted" asChild>
                  <Repeat size={14} />
                </Icon>
              )}
            </HStack>
            <HStack gap={1}>
              {seg.tags && seg.tags.length > 0 && (
                <HStack gap={1}>
                  {seg.tags.map((tag) => (
                    <Badge key={tag.id} size="sm" variant="subtle" colorPalette="blue">
                      {tag.name}
                    </Badge>
                  ))}
                </HStack>
              )}
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
            </HStack>
          </HStack>
          {seg.description && (
            <Text fontSize="xs" color="fg.muted" mt={1} ml={6} lineClamp={2}>
              {seg.description}
            </Text>
          )}
        </Box>
      </HStack>
    </Box>
  )
}
