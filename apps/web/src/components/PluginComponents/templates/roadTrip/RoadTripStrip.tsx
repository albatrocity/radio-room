import { Box, HStack, Stack, Text } from "@chakra-ui/react"
import { openGameStateOnTab } from "../../../../actors/modalsActor"
import type { RoadTripStripComponentProps } from "../../../../types/PluginComponent"
import { usePluginComponentContext } from "../../context"
import { FuelGauge } from "./FuelGauge"
import { TripRouteLine } from "./TripRouteLine"
import {
  DEFAULT_TRIP_KEY,
  fuelView,
  stripContext,
  stripReadout,
  useInterpolatedVanMile,
  useTripStore,
  vanPhase,
} from "./tripView"
import { useRoadTripVanMotion } from "./useRoadTripVanMotion"

/** Trip strip in `aboveChat` (M7): route line over a status row. Tap opens the Trip tab. */
export function RoadTripStripTemplateComponent({
  tripKey = DEFAULT_TRIP_KEY,
  tabId = "trip",
}: RoadTripStripComponentProps) {
  const { pluginName } = usePluginComponentContext()
  const trip = useTripStore(tripKey)
  const { mile, gallons, now } = useInterpolatedVanMile(trip)
  const phase = trip ? vanPhase(trip, mile) : null
  const motion = useRoadTripVanMotion(`${pluginName ?? "road-trip"}:${tripKey}`, phase)

  if (!trip || !phase) return null

  const openTripTab = () => {
    if (pluginName) openGameStateOnTab({ tabId: `${pluginName}:${tabId}` })
  }
  const context = stripContext(trip, mile, now)
  const readout = stripReadout(trip, mile, now, motion.phase ?? phase)

  return (
    // inline-size containment: the status row mustn't widen the chat column.
    <Box px={3} pt={1} width="full" css={{ contain: "inline-size" }} data-road-trip-strip>
      <Stack
        gap={1}
        h="auto"
        px={2}
        py={1.5}
        borderRadius="md"
        borderWidth="1px"
        bg="bg"
        cursor="pointer"
        role="button"
        tabIndex={0}
        aria-label={`Road trip: ${context}. Open the Trip tab`}
        onClick={openTripTab}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openTripTab()
          }
        }}
      >
        <TripRouteLine trip={trip} mile={mile} motion={motion} />
        <HStack gap={2} fontSize="sm" lineHeight="short" minW={0}>
          <Text fontWeight="medium" truncate flexShrink={0} maxW="60%">
            {readout.status}
          </Text>
          <Box flex={1} />
          {readout.destination ? (
            <Text color="fg.muted" truncate minW={0} textAlign="right">
              {readout.destination}
            </Text>
          ) : null}
          {readout.countdown ? (
            <Text color="fg.muted" flexShrink={0} fontVariantNumeric="tabular-nums">
              {readout.countdown}
            </Text>
          ) : null}
          <FuelGauge fuel={fuelView(trip, gallons)} />
        </HStack>
      </Stack>
    </Box>
  )
}
