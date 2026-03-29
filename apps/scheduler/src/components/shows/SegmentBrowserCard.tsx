import { Box, Badge, Button, HStack, Text, Icon } from "@chakra-ui/react"
import { useDraggable } from "@dnd-kit/react"
import { ListPlus, Repeat } from "lucide-react"
import type { SegmentDTO } from "@repo/types"

export interface SegmentBrowserCardProps {
  segment: SegmentDTO
  /**
   * Static presentation for {@link DragOverlay}: do not register a second draggable
   * with the same id as the list row, and do not mirror transform on the source.
   */
  isDragOverlay?: boolean
  /** When set, a mobile-only control appends this segment to the show timeline (end). */
  onAppendToShowEnd?: () => void
  /** Disables the append control while a reorder mutation is in flight. */
  isAppendPending?: boolean
}

function SegmentBrowserCardBody({ segment }: { segment: SegmentDTO }) {
  return (
    <>
      <HStack justify="space-between" gap={2}>
        <Text fontWeight="medium" fontSize="sm" lineClamp={1}>
          {segment.title}
        </Text>
        <HStack gap={1} flexShrink={0}>
          {segment.duration != null && (
            <Badge size="sm" variant="outline" colorPalette="gray">
              {segment.duration}m
            </Badge>
          )}
          {segment.isRecurring && (
            <Icon color="fg.muted" asChild>
              <Repeat size={14} />
            </Icon>
          )}
        </HStack>
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

function SegmentBrowserCardDraggable({
  segment,
  onAppendToShowEnd,
  isAppendPending,
}: Pick<SegmentBrowserCardProps, "segment" | "onAppendToShowEnd" | "isAppendPending">) {
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
      {onAppendToShowEnd ? (
        <Button
          type="button"
          mt={2}
          size="xs"
          variant="outline"
          width="full"
          display={{ base: "flex", lg: "none" }}
          loading={isAppendPending}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAppendToShowEnd()
          }}
        >
          <Icon asChild boxSize={3.5} mr={1}>
            <ListPlus />
          </Icon>
          Add to show
        </Button>
      ) : null}
    </Box>
  )
}

export function SegmentBrowserCard({
  segment,
  isDragOverlay,
  onAppendToShowEnd,
  isAppendPending,
}: SegmentBrowserCardProps) {
  if (isDragOverlay) {
    return <SegmentBrowserCardOverlay segment={segment} />
  }
  return (
    <SegmentBrowserCardDraggable
      segment={segment}
      onAppendToShowEnd={onAppendToShowEnd}
      isAppendPending={isAppendPending}
    />
  )
}
