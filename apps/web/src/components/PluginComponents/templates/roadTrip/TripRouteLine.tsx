import { Box, Text } from "@chakra-ui/react"
import type { TripStore } from "@repo/road-trip-map"
import { useAnimationsEnabled } from "../../../../hooks/useReducedMotion"
import { siteLabel, sitePin } from "./tripView"

type Props = {
  trip: TripStore
  mile: number
  /** Pixel height of the line row; pins scale with it. */
  size?: "sm" | "md"
}

/** Route line: travelled solid, remaining dashed, icon pins, `?` for unrevealed sites. */
export function TripRouteLine({ trip, mile, size = "sm" }: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const pct = (value: number) =>
    trip.routeMiles > 0 ? Math.min(100, Math.max(0, (value / trip.routeMiles) * 100)) : 0
  const vanPct = pct(mile)
  const pinSize = size === "md" ? "md" : "xs"
  const height = size === "md" ? "28px" : "18px"

  return (
    <Box position="relative" h={height} flex={1} minW="80px" aria-hidden>
      <Box
        position="absolute"
        top="50%"
        left={0}
        right={0}
        borderTopWidth="2px"
        borderTopStyle="dashed"
        borderColor="fg.muted"
        opacity={0.6}
      />
      <Box
        position="absolute"
        top="50%"
        left={0}
        w={`${vanPct}%`}
        borderTopWidth="2px"
        borderColor="action.solid"
        transition={animationsEnabled ? "width 1s linear" : "none"}
      />
      {trip.sites.map((site) => (
        <Text
          key={site.id}
          as="span"
          position="absolute"
          top="50%"
          left={`${pct(site.mile)}%`}
          transform="translate(-50%, -50%)"
          fontSize={pinSize}
          lineHeight={1}
          bg="bg"
          borderRadius="full"
          px="1px"
          opacity={site.state === "skipped" ? 0.45 : 1}
          title={siteLabel(site)}
          fontWeight={site.state === "unrevealed" ? "bold" : undefined}
          color={site.state === "unrevealed" ? "fg.muted" : undefined}
        >
          {sitePin(site)}
        </Text>
      ))}
      <Box
        position="absolute"
        top="50%"
        left={`${vanPct}%`}
        transform="translate(-50%, -50%)"
        boxSize={size === "md" ? "12px" : "9px"}
        borderRadius="full"
        bg="action.solid"
        borderWidth="2px"
        borderColor="bg"
        transition={animationsEnabled ? "left 1s linear" : "none"}
        data-road-trip-van
      />
    </Box>
  )
}
