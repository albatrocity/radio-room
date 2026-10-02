import { Box, HStack, Text } from "@chakra-ui/react"
import type { FuelView } from "./tripView"

const BARS = 5

/** Compact `⛽ ▮▮▮▯▯` gauge for the strip (M7); turns orange when low, red when empty. */
export function FuelGauge({ fuel }: { fuel: FuelView }) {
  const filled = fuel.empty ? 0 : Math.max(1, Math.ceil(fuel.fraction * BARS))
  const color = fuel.empty ? "red.solid" : fuel.low ? "orange.solid" : "fg.muted"
  const percent = Math.round(fuel.fraction * 100)
  return (
    <HStack
      gap="2px"
      flexShrink={0}
      aria-label={`Gas ${percent}%${fuel.low ? ", low" : ""}`}
      title={`Gas ${percent}%`}
      role="img"
    >
      <Text as="span" fontSize="xs" lineHeight={1} aria-hidden>
        ⛽
      </Text>
      {Array.from({ length: BARS }, (_, i) => (
        <Box
          key={i}
          w="4px"
          h="10px"
          borderRadius="1px"
          bg={i < filled ? color : "transparent"}
          borderWidth="1px"
          borderColor={color}
        />
      ))}
    </HStack>
  )
}
