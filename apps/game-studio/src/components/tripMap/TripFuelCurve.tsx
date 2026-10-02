import { Box, HStack, Text } from "@chakra-ui/react"
import type { FuelProjection } from "../../tripMap/tripMapDraft"

const HEIGHT = 48

type Props = {
  fuel: FuelProjection
  routeMiles: number
}

/** No-vote gas gauge along the route (M8, Phase 2), aligned under `TripRouteTrack`. */
export function TripFuelCurve({ fuel, routeMiles }: Props) {
  const x = (mile: number) => (routeMiles > 0 ? (mile / routeMiles) * 100 : 0)
  const y = (gallons: number) =>
    fuel.tankGallons > 0 ? HEIGHT - (gallons / fuel.tankGallons) * HEIGHT : HEIGHT
  const line = fuel.points.map((p) => `${x(p.mile)},${y(p.gallons)}`).join(" ")
  const lowY = HEIGHT - fuel.lowPct * HEIGHT

  return (
    <Box mt="2">
      <Box position="relative" mx="4" h={`${HEIGHT}px`}>
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 100 ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Gas along the route if nobody votes"
        >
          <rect
            x="0"
            y={lowY}
            width="100"
            height={HEIGHT - lowY}
            fill="var(--chakra-colors-orange-subtle)"
          />
          <polyline
            points={line}
            fill="none"
            stroke="var(--chakra-colors-green-solid)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {fuel.emptyAtMile !== null ? (
            <line
              x1={x(fuel.emptyAtMile)}
              x2={x(fuel.emptyAtMile)}
              y1="0"
              y2={HEIGHT}
              stroke="var(--chakra-colors-red-solid)"
              strokeWidth="2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {fuel.stops.map((stop) => (
          <Text
            key={stop.siteId}
            position="absolute"
            top="0"
            left={`${x(stop.mile)}%`}
            transform="translateX(-50%)"
            fontSize="2xs"
            color={stop.stops ? "fg" : "fg.subtle"}
            title={stop.stops ? `Fills up at ${stop.name}` : `Drives past ${stop.name}`}
          >
            {stop.stops ? "⛽" : "·"}
          </Text>
        ))}
      </Box>
      <HStack justify="space-between" fontSize="xs" color="fg.muted" px="1">
        <Text>Gas if nobody votes</Text>
        <Text color={fuel.emptyAtMile !== null ? "red.fg" : undefined}>
          {fuel.emptyAtMile !== null
            ? `Runs dry at mile ${fuel.emptyAtMile.toFixed(1)}`
            : fuel.lowAtMile !== null
              ? `Low at mile ${fuel.lowAtMile.toFixed(1)}`
              : "Never low"}
        </Text>
      </HStack>
    </Box>
  )
}
