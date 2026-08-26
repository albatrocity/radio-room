import { Box, HStack, Skeleton, SkeletonCircle, Text, VStack } from "@chakra-ui/react"
import { EyeOff } from "lucide-react"

const ROW_COUNT = 3
const ROW_HEIGHT = 78

function RedactedQueueTrackRow() {
  return (
    <HStack gap={3} w="100%" h={`${ROW_HEIGHT}px`} align="center" px={1}>
      <SkeletonCircle size="12" flexShrink={0} />
      <VStack align="stretch" flex={1} gap={2}>
        <Skeleton height="4" width="70%" />
        <Skeleton height="3" width="45%" />
      </VStack>
    </HStack>
  )
}

export default function RedactedQueueTracksPreview() {
  return (
    <Box position="relative" w="100%" maxH="200px" overflow="hidden">
      <Box filter="blur(4px)" userSelect="none" pointerEvents="none" aria-hidden>
        <VStack align="stretch" gap={0}>
          {Array.from({ length: ROW_COUNT }).map((_, index) => (
            <RedactedQueueTrackRow key={index} />
          ))}
        </VStack>
      </Box>
      <VStack
        position="absolute"
        inset={0}
        justify="center"
        align="center"
        gap={2}
        px={4}
        bg="blackAlpha.100"
      >
        <EyeOff size={28} strokeWidth={1.75} color="var(--chakra-colors-fg-muted)" />
        <Text fontSize="xs" color="fg.muted" textAlign="center">
          Upcoming tracks are currently hidden.
        </Text>
      </VStack>
    </Box>
  )
}
