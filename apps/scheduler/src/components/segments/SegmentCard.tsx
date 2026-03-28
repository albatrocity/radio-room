import { Box, Badge, HStack, Text, Icon } from "@chakra-ui/react"
import { useDraggable } from "@dnd-kit/core"
import { Repeat } from "lucide-react"
import type { SegmentDTO } from "@repo/types"

interface SegmentCardProps {
  segment: SegmentDTO
  onClick: () => void
}

export function SegmentCard({ segment, onClick }: SegmentCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: segment.id,
    data: { segment },
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
      p={3}
      cursor="grab"
      opacity={isDragging ? 0.5 : 1}
      onClick={onClick}
      _hover={{ borderColor: "border.emphasized" }}
      transition="border-color 0.15s"
    >
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
    </Box>
  )
}
