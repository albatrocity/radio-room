import { Box, Badge, HStack, Text, Icon, Stack } from "@chakra-ui/react"
import { useDraggable } from "@dnd-kit/react"
import { Repeat } from "lucide-react"
import type { SegmentDTO } from "@repo/types"

export interface SegmentCardProps {
  segment: SegmentDTO
  onClick: () => void
  /**
   * Static presentation for {@link DragOverlay}: do not register a second draggable
   * with the same id, and do not mirror transform on the source.
   */
  isDragOverlay?: boolean
}

function SegmentCardBody({ segment }: { segment: SegmentDTO }) {
  return (
    <Stack gap={1}>
      <HStack justify="space-between" mb={segment.description || segment.tags?.length ? 1 : 0}>
        <Text fontWeight="medium" fontSize="sm" lineClamp={1}>
          {segment.title}
        </Text>
        {segment.isRecurring && (
          <Icon color="fg.muted" asChild>
            <Repeat size={14} />
          </Icon>
        )}
      </HStack>
      {segment.description && (
        <Text fontSize="xs" color="fg.muted" lineClamp={2} mb={1}>
          {segment.description}
        </Text>
      )}
      {segment.tags && segment.tags.length > 0 && (
        <HStack gap={1} flexWrap="wrap">
          {segment.tags.map((tag) => (
            <Badge key={tag.id} size="sm" variant="subtle" colorPalette="blue">
              {tag.name}
            </Badge>
          ))}
        </HStack>
      )}
    </Stack>
  )
}

function SegmentCardOverlay({ segment, onClick }: Pick<SegmentCardProps, "segment" | "onClick">) {
  return (
    <Box
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={3}
      cursor="grabbing"
      boxShadow="md"
      onClick={onClick}
      _hover={{ borderColor: "border.emphasized" }}
      transition="border-color 0.15s"
    >
      <SegmentCardBody segment={segment} />
    </Box>
  )
}

function SegmentCardDraggable({ segment, onClick }: Pick<SegmentCardProps, "segment" | "onClick">) {
  const { ref, isDragging } = useDraggable({
    id: segment.id,
    data: { segment },
  })

  return (
    <Box
      ref={ref}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={3}
      cursor="grab"
      opacity={isDragging ? 0 : 1}
      pointerEvents={isDragging ? "none" : undefined}
      onClick={onClick}
      _hover={{ borderColor: "border.emphasized" }}
      transition="border-color 0.15s"
    >
      <SegmentCardBody segment={segment} />
    </Box>
  )
}

export function SegmentCard({ segment, onClick, isDragOverlay }: SegmentCardProps) {
  if (isDragOverlay) {
    return <SegmentCardOverlay segment={segment} onClick={onClick} />
  }
  return <SegmentCardDraggable segment={segment} onClick={onClick} />
}
