import { Box, Heading, VStack, Text, ScrollArea } from "@chakra-ui/react"
import { useDroppable } from "@dnd-kit/react"
import type { SegmentDTO, SegmentStatus } from "@repo/types"
import { SegmentCard } from "./SegmentCard"

const STATUS_LABELS: Record<SegmentStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archived",
}

interface SegmentColumnProps {
  status: SegmentStatus
  segments: SegmentDTO[]
  onCardClick: (segment: SegmentDTO) => void
}

export function SegmentColumn({ status, segments, onCardClick }: SegmentColumnProps) {
  const { isDropTarget, ref } = useDroppable({ id: status })

  return (
    <Box
      ref={ref}
      flex="1"
      minW="240px"
      height="100%"
      bg={isDropTarget ? "bg.emphasized" : "bg.subtle"}
      borderRadius="lg"
      p={3}
      transition="background 0.15s"
      display="flex"
      flexDirection="column"
      minH="0"
    >
      <Heading size="sm" mb={3} px={1} flexShrink={0}>
        {STATUS_LABELS[status]}{" "}
        <Text as="span" color="fg.muted" fontWeight="normal">
          ({segments.length})
        </Text>
      </Heading>
      <ScrollArea.Root flex="1" minH={0} w="100%" overflow="hidden">
        <ScrollArea.Viewport>
          <VStack gap={2} align="stretch" minH="100px">
            {segments.map((seg) => (
              <SegmentCard key={seg.id} segment={seg} onClick={() => onCardClick(seg)} />
            ))}
          </VStack>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    </Box>
  )
}
