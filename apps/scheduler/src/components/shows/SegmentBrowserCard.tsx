import { Box, Badge, HStack, Text, Icon } from "@chakra-ui/react"
import { useDraggable } from "@dnd-kit/react"
import { Repeat } from "lucide-react"
import type { SegmentDTO } from "@repo/types"

export interface SegmentBrowserCardProps {
  segment: SegmentDTO
  /**
   * Static presentation for {@link DragOverlay}: do not register a second draggable
   * with the same id as the list row, and do not mirror transform on the source.
   */
  isDragOverlay?: boolean
}

function SegmentBrowserCardBody({ segment }: { segment: SegmentDTO }) {
  return (
    <>
      <HStack justify="space-between">
        <Text fontWeight="medium" fontSize="sm" lineClamp={1}>
          {segment.title}
        </Text>
        {segment.isRecurring && (
          <Icon color="fg.muted" asChild>
            <Repeat size={14} />
          </Icon>
        )}
      </HStack>
      {segment.tags && segment.tags.length > 0 && (
        <HStack gap={1} mt={1} flexWrap="wrap">
          {segment.tags.map((tag) => (
            <Badge key={tag.id} size="sm" variant="subtle" colorPalette="blue">
              {tag.name}
            </Badge>
          ))}
        </HStack>
      )}
    </>
  )
}

function SegmentBrowserCardOverlay({ segment }: Pick<SegmentBrowserCardProps, "segment">) {
  return (
    <Box
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={2}
      cursor="grabbing"
      boxShadow="md"
      _hover={{ borderColor: "border.emphasized" }}
      transition="border-color 0.15s"
    >
      <SegmentBrowserCardBody segment={segment} />
    </Box>
  )
}

function SegmentBrowserCardDraggable({ segment }: Pick<SegmentBrowserCardProps, "segment">) {
  const { ref, isDragging } = useDraggable({
    id: `segment-browser-${segment.id}`,
    data: { segment, source: "segment-browser" as const },
  })

  return (
    <Box
      ref={ref}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={2}
      cursor="grab"
      opacity={isDragging ? 0 : 1}
      pointerEvents={isDragging ? "none" : undefined}
      _hover={{ borderColor: "border.emphasized" }}
      transition="border-color 0.15s"
    >
      <SegmentBrowserCardBody segment={segment} />
    </Box>
  )
}

export function SegmentBrowserCard({ segment, isDragOverlay }: SegmentBrowserCardProps) {
  if (isDragOverlay) {
    return <SegmentBrowserCardOverlay segment={segment} />
  }
  return <SegmentBrowserCardDraggable segment={segment} />
}
