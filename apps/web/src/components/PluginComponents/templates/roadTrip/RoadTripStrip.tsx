import { useState } from "react"
import { Box, HStack, IconButton, Text } from "@chakra-ui/react"
import { LuChevronLeft } from "react-icons/lu"
import { openGameStateOnTab } from "../../../../actors/modalsActor"
import type { RoadTripStripComponentProps } from "../../../../types/PluginComponent"
import { usePluginComponentContext } from "../../context"
import { TripRouteLine } from "./TripRouteLine"
import { DEFAULT_TRIP_KEY, stripContext, useInterpolatedVanMile, useTripStore } from "./tripView"

const COLLAPSED_STORAGE_KEY = "road-trip-strip-collapsed"

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0")
  } catch {
    // Private mode: the preference just doesn't persist.
  }
}

/** One-line trip strip in `aboveChat` (M7). Tap opens the Trip tab. */
export function RoadTripStripTemplateComponent({
  tripKey = DEFAULT_TRIP_KEY,
  tabId = "trip",
}: RoadTripStripComponentProps) {
  const { pluginName } = usePluginComponentContext()
  const trip = useTripStore(tripKey)
  const { mile, now } = useInterpolatedVanMile(trip)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  if (!trip) return null

  const toggle = (next: boolean) => {
    setCollapsed(next)
    writeCollapsed(next)
  }
  const openTripTab = () => {
    if (pluginName) openGameStateOnTab({ tabId: `${pluginName}:${tabId}` })
  }
  const context = stripContext(trip, mile, now)

  if (collapsed) {
    return (
      <HStack justify="flex-end" px={3} pt={1}>
        <IconButton
          aria-label={`Show road trip: ${context}`}
          title={context}
          size="xs"
          variant="ghost"
          onClick={() => toggle(false)}
        >
          <Text as="span" fontSize="md">
            🚐
          </Text>
        </IconButton>
      </HStack>
    )
  }

  return (
    <Box px={3} pt={1} width="full" data-road-trip-strip>
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
        <Text as="span" fontSize="sm" lineHeight={1} flexShrink={0} aria-hidden>
          🚐
        </Text>
        <TripRouteLine trip={trip} mile={mile} />
        <Text fontSize="xs" truncate maxW="55%" flexShrink={1} color="fg.muted">
          {context}
        </Text>
        <IconButton
          aria-label="Collapse road trip strip"
          size="2xs"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            toggle(true)
          }}
        >
          <LuChevronLeft />
        </IconButton>
      </HStack>
    </Box>
  )
}
