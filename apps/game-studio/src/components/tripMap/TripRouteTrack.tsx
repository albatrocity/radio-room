import { Box, HStack, Text } from "@chakra-ui/react"
import { useRef, useState } from "react"
import { isDestination, revealMileAtBaseSpeed, type TripMap } from "@repo/road-trip-map"
import type { TripSiteDraft } from "../../tripMap/tripMapDraft"

type Props = {
  sites: TripSiteDraft[]
  routeMiles: number
  /** Resolved map for reveal ticks; null while the draft doesn't parse. */
  resolved: TripMap | null
  selectedSiteId: string | null
  onSelect: (siteId: string) => void
  onMove: (siteId: string, mile: number) => void
}

/** Route line with draggable site pins and faint reveal ticks (M8). */
export function TripRouteTrack({
  sites,
  routeMiles,
  resolved,
  selectedSiteId,
  onSelect,
  onMove,
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

  return (
    <Box>
      <Box ref={trackRef} position="relative" h="64px" mx="4">
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
      </Box>
      <HStack justify="space-between" fontSize="xs" color="fg.muted" px="1">
        <Text>0 mi · depart</Text>
        <Text>{routeMiles.toFixed(1)} mi</Text>
      </HStack>
    </Box>
  )
}
