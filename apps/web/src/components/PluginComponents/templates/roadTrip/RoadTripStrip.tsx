import { Box, HStack, Icon, Text } from "@chakra-ui/react"
import { Van } from "lucide-react"
import { openGameStateOnTab } from "../../../../actors/modalsActor"
import type { RoadTripStripComponentProps } from "../../../../types/PluginComponent"
import { usePluginComponentContext } from "../../context"
import { FuelGauge } from "./FuelGauge"
import { TripRouteLine } from "./TripRouteLine"
import {
  DEFAULT_TRIP_KEY,
  fuelView,
  stripContext,
  useInterpolatedVanMile,
  useTripStore,
} from "./tripView"

/** One-line trip strip in `aboveChat` (M7). Tap opens the Trip tab. */
export function RoadTripStripTemplateComponent({
  tripKey = DEFAULT_TRIP_KEY,
  tabId = "trip",
}: RoadTripStripComponentProps) {
  const { pluginName } = usePluginComponentContext()
  const trip = useTripStore(tripKey)
  const { mile, gallons, now } = useInterpolatedVanMile(trip)

  if (!trip) return null

  const openTripTab = () => {
    if (pluginName) openGameStateOnTab({ tabId: `${pluginName}:${tabId}` })
  }
  const context = stripContext(trip, mile, now)

  return (
    // inline-size containment: the one-line context mustn't widen the chat column.
    <Box px={3} pt={1} width="full" css={{ contain: "inline-size" }} data-road-trip-strip>
      <HStack
        gap={2}
        h="32px"
        maxH="32px"
        px={2}
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
        <Icon as={Van} boxSize={4} flexShrink={0} color="fg.muted" aria-hidden />
        <TripRouteLine trip={trip} mile={mile} />
        <Text fontSize="xs" truncate flex="0 1 auto" minW={0} color="fg.muted">
          {context}
        </Text>
        <FuelGauge fuel={fuelView(trip, gallons)} />
      </HStack>
    </Box>
  )
}
