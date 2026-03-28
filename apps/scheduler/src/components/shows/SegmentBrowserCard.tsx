import { Box, Badge, HStack, Text, Icon } from "@chakra-ui/react"
import { useDraggable } from "@dnd-kit/core"
import { Repeat } from "lucide-react"
import type { SegmentDTO } from "@repo/types"

interface SegmentBrowserCardProps {
  segment: SegmentDTO
}

export function SegmentBrowserCard({ segment }: SegmentBrowserCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `browser-${segment.id}`,
    data: { segment, source: "browser" },
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  return (
    <Box
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={2}
      cursor="grab"
      opacity={isDragging ? 0.5 : 1}
      _hover={{ borderColor: "border.emphasized" }}
      transition="border-color 0.15s"
    >
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
    </Box>
  )
}
