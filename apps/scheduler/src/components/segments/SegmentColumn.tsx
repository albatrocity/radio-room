import { Box, Heading, VStack, Text } from "@chakra-ui/react"
import { useDroppable } from "@dnd-kit/core"
import type { SegmentDTO, SegmentStatus } from "@repo/types"
import { SegmentCard } from "./SegmentCard"

const STATUS_LABELS: Record<SegmentStatus, string> = {
  draft: "Draft",
  working: "Working",
  ready: "Ready",
  archived: "Archived",
}

interface SegmentColumnProps {
  status: SegmentStatus
  segments: SegmentDTO[]
  onCardClick: (segment: SegmentDTO) => void
}

export function SegmentColumn({ status, segments, onCardClick }: SegmentColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: status })

  return (
    <Box
      ref={setNodeRef}
      flex="1"
      minW="240px"
      bg={isOver ? "bg.emphasized" : "bg.subtle"}
      borderRadius="lg"
      p={3}
      transition="background 0.15s"
    >
      <Heading size="sm" mb={3} px={1}>
        {STATUS_LABELS[status]}{" "}
        <Text as="span" color="fg.muted" fontWeight="normal">
          ({segments.length})
        </Text>
      </Heading>
      <VStack gap={2} align="stretch" minH="100px">
        {segments.map((seg) => (
          <SegmentCard key={seg.id} segment={seg} onClick={() => onCardClick(seg)} />
        ))}
      </VStack>
    </Box>
  )
}
