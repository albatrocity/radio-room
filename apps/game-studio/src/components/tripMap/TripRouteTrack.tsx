import { Box, HStack, Text } from "@chakra-ui/react"
import { useRef, useState } from "react"
import {
  INCIDENTS,
  isDestination,
  revealMileAtBaseSpeed,
  type TripMap,
} from "@repo/road-trip-map"
import type { ScriptedEventDraft, TripSiteDraft } from "../../tripMap/tripMapDraft"

type Props = {
  sites: TripSiteDraft[]
  events: ScriptedEventDraft[]
  routeMiles: number
  /** Resolved map for reveal ticks; null while the draft doesn't parse. */
  resolved: TripMap | null
  selectedSiteId: string | null
  selectedEventId: string | null
  onSelect: (siteId: string) => void
  onMove: (siteId: string, mile: number) => void
  onSelectEvent: (eventId: string) => void
  onMoveEvent: (eventId: string, mile: number) => void
}

/** Route line with draggable site pins above, scripted-event pins below, and reveal ticks (M8). */
export function TripRouteTrack({
  sites,
  events,
  routeMiles,
  resolved,
  selectedSiteId,
  selectedEventId,
  onSelect,
  onMove,
  onSelectEvent,
  onMoveEvent,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const pct = (mile: number) =>
    routeMiles > 0 ? Math.min(100, Math.max(0, (mile / routeMiles) * 100)) : 0

  const mileAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return ((clientX - rect.left) / rect.width) * routeMiles
  }

  const roundedMile = (clientX: number) =>
    Math.round(Math.min(Math.max(0.1, mileAt(clientX)), routeMiles - 0.1) * 10) / 10

  return (
    <Box>
      <Box ref={trackRef} position="relative" h={events.length > 0 ? "96px" : "64px"} mx="4">
        <Box
          position="absolute"
          top="32px"
          left="0"
          right="0"
          borderTopWidth="3px"
          borderColor="fg.muted"
        />
        {resolved?.sites.map((site) =>
          isDestination(site) ? null : (
            <Box
              key={`tick-${site.id}`}
              position="absolute"
              top="26px"
              left={`${pct(revealMileAtBaseSpeed(resolved, site))}%`}
              h="15px"
              borderLeftWidth="1px"
              borderColor="fg.subtle"
              opacity={0.6}
              title={`${site.name} reveals here`}
            />
          ),
        )}
        {sites.map((site) => {
          const destination = isDestination(site)
          const selected = site.id === selectedSiteId
          return (
            <Box
              key={site.id}
              position="absolute"
              top="0"
              left={`${pct(site.mile)}%`}
              transform="translateX(-50%)"
              textAlign="center"
              cursor={destination ? "pointer" : "grab"}
              userSelect="none"
              touchAction="none"
              onPointerDown={(e) => {
                onSelect(site.id)
                if (destination) return
                e.currentTarget.setPointerCapture(e.pointerId)
                setDragging(site.id)
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDragging(null)
              }}
              onPointerMove={(e) => {
                if (dragging === site.id) onMove(site.id, mileAt(e.clientX))
              }}
            >
              <Text
                fontSize="xl"
                lineHeight="1"
                px="1"
                borderRadius="md"
                borderWidth={selected ? "2px" : "0"}
                borderColor="blue.solid"
                bg="bg"
              >
                {site.icon || "📍"}
              </Text>
              <Box
                mx="auto"
                mt="2px"
                h="10px"
                w="2px"
                bg={site.mandatory || destination ? "red.solid" : "fg.muted"}
              />
              <Text fontSize="2xs" color="fg.muted" whiteSpace="nowrap">
                {site.mile.toFixed(1)}
              </Text>
            </Box>
          )
        })}
        {events.map((event) => {
          const key = `event:${event.id}`
          const selected = event.id === selectedEventId
          return (
            <Box
              key={key}
              position="absolute"
              top="36px"
              left={`${pct(event.atMile)}%`}
              transform="translateX(-50%)"
              textAlign="center"
              cursor="grab"
              userSelect="none"
              touchAction="none"
              title={`${INCIDENTS[event.incident].name} at mile ${event.atMile}`}
              onPointerDown={(e) => {
                onSelectEvent(event.id)
                e.currentTarget.setPointerCapture(e.pointerId)
                setDragging(key)
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDragging(null)
              }}
              onPointerMove={(e) => {
                if (dragging === key) onMoveEvent(event.id, roundedMile(e.clientX))
              }}
            >
              <Box mx="auto" h="8px" w="0" borderLeftWidth="2px" borderStyle="dashed" borderColor="orange.solid" />
              <Text
                fontSize="md"
                lineHeight="1"
                px="1"
                borderRadius="md"
                borderWidth={selected ? "2px" : "1px"}
                borderColor={selected ? "blue.solid" : "orange.muted"}
                bg="bg"
              >
                {INCIDENTS[event.incident].emoji}
              </Text>
              <Text fontSize="2xs" color="orange.fg" whiteSpace="nowrap">
                {event.atMile.toFixed(1)}
              </Text>
            </Box>
          )
        })}
      </Box>
      <HStack justify="space-between" fontSize="xs" color="fg.muted" px="1">
        <Text>0 mi · depart</Text>
        <Text>{routeMiles.toFixed(1)} mi</Text>
      </HStack>
    </Box>
  )
}
