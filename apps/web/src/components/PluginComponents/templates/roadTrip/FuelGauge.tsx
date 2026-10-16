import { Box, HStack, Icon } from "@chakra-ui/react"
import { Fuel } from "lucide-react"
import type { FuelView } from "./tripView"

const BARS = 5

/** Compact fuel-pump + `▮▮▮▯▯` gauge for the strip (M7); turns orange when low, red when empty. */
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
      <Icon as={Fuel} boxSize={3} color={color} aria-hidden />
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
