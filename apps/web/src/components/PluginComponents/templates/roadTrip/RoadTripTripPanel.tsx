import { Badge, Box, Card, CardBody, HStack, ScrollArea, Stack, Text } from "@chakra-ui/react"
import type { TripStore, TripStoreEvent, TripStoreSite } from "@repo/road-trip-map"
import { useStickToBottom } from "use-stick-to-bottom"
import ScrollShadowViewport from "../../../ScrollShadowViewport"
import { useOpenTabDetail } from "../../../Modals/GameState/useOpenTabDetail"
import type { RoadTripTripPanelComponentProps } from "../../../../types/PluginComponent"
import { usePluginComponentContext } from "../../context"
import { TripRouteLine } from "./TripRouteLine"
import {
  DEFAULT_TRIP_KEY,
  SITE_STATE_LABEL,
  formatClock,
  formatMiles,
  minutesToSite,
  siteLabel,
  sitePin,
  stripContext,
  tripLog,
  tripTabTitle,
  useInterpolatedVanMile,
  useTripStore,
  vanPhase,
} from "./tripView"
import { useRoadTripVanMotion } from "./useRoadTripVanMotion"

const STATUS_BADGE: Record<TripStore["status"], { label: string; palette: string }> = {
  loaded: { label: "Ready", palette: "gray" },
  driving: { label: "On the road", palette: "green" },
  arrived: { label: "Arrived", palette: "blue" },
  late: { label: "Arrived late", palette: "orange" },
  ended: { label: "Ended", palette: "gray" },
  stranded: { label: "Ended early", palette: "red" },
}

function etaLine(trip: TripStore): string | null {
  const { projectedArrivalAt, targetArrivalAt } = trip.eta
  if (trip.arrivedAt) return `Arrived ${formatClock(trip.arrivedAt)}`
  if (projectedArrivalAt === null) return null
  const base = `ETA ${formatClock(projectedArrivalAt)}`
  if (targetArrivalAt === null) return base
  const delta = Math.round((projectedArrivalAt - targetArrivalAt) / 60_000)
  if (delta === 0) return `${base} · on target`
  return `${base} · ${Math.abs(delta)} min ${delta > 0 ? "behind" : "ahead of"} target`
}

function SiteRow({
  trip,
  site,
  mile,
  onOpen,
}: {
  trip: TripStore
  site: TripStoreSite
  mile: number
  onOpen?: () => void
}) {
  const minutes = minutesToSite(trip, site, mile)
  const detail =
    site.visitedAt !== undefined
      ? `Visited ${formatClock(site.visitedAt)}`
      : `mile ${formatMiles(site.mile)}${minutes !== null ? ` · ${minutes} min` : ""}`

  return (
    <HStack
      as={onOpen ? "button" : "div"}
      onClick={onOpen}
      w="full"
      textAlign="left"
      gap={3}
      px={3}
      py={2}
      borderRadius="md"
      borderWidth="1px"
      opacity={
        site.state === "ahead" || site.state === "unrevealed"
          ? 0.4
          : site.state === "skipped"
          ? 0.65
          : 1
      }
      cursor={onOpen ? "pointer" : "default"}
      _hover={onOpen ? { bg: "bg.muted" } : undefined}
      aria-label={
        onOpen ? `${siteLabel(site)}, ${SITE_STATE_LABEL[site.state]}. Open details` : undefined
      }
    >
      <Text as="span" fontSize="lg" lineHeight={1} w="1.5em" textAlign="center" aria-hidden>
        {sitePin(site)}
      </Text>
      <Stack gap={0} flex={1} minW={0}>
        <Text fontSize="sm" fontWeight="medium" truncate>
          {site.state === "unrevealed" ? "Something up ahead" : siteLabel(site)}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {SITE_STATE_LABEL[site.state]}
          {site.destination ? " · Destination" : site.mandatory ? " · Planned stop" : ""}
        </Text>
      </Stack>
      <Text fontSize="xs" color="fg.muted" flexShrink={0}>
        {detail}
      </Text>
    </HStack>
  )
}

/**
 * Trip tab body (M7): a fixed header (route, live context, "3 / 7 visited")
 * over the trip log in its own scroll area, pinned to its newest entries like
 * chat. The log is sites in route order, with each visited site's narrative and
 * the van's part installs and incidents in between. The tab sets `fillHeight`.
 */
export function RoadTripTripPanelTemplateComponent({
  tripKey = DEFAULT_TRIP_KEY,
}: RoadTripTripPanelComponentProps) {
  const { pluginName } = usePluginComponentContext()
  const trip = useTripStore(tripKey)
  const { mile, now } = useInterpolatedVanMile(trip)
  const openDetail = useOpenTabDetail(`${pluginName ?? "road-trip"}:trip`)
  const motion = useRoadTripVanMotion(
    `${pluginName ?? "road-trip"}:${tripKey}`,
    trip ? vanPhase(trip, mile) : null,
  )
  const { scrollRef, contentRef } = useStickToBottom({ initial: "instant", resize: "instant" })

  if (!trip) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No trip loaded.
      </Text>
    )
  }

  const badge = STATUS_BADGE[trip.status]
  const eta = etaLine(trip)
  const title = tripTabTitle(trip, mile)
  const context = stripContext(trip, mile, now)

  return (
    <Stack gap={3} flex="1" minH={0}>
      <Card.Root bg="secondaryBg">
        <Card.Body>
          <Stack gap={3} flexShrink={0}>
            <Stack gap={1}>
              <HStack justify="space-between" align="center">
                <Text fontWeight="bold" fontSize="md" truncate>
                  {title}
                </Text>
                <Badge colorPalette={badge.palette}>{badge.label}</Badge>
              </HStack>
              <Text fontSize="sm" color="fg.muted">
                {formatMiles(mile)} / {formatMiles(trip.routeMiles)} mi · {trip.visitedCount} /{" "}
                {trip.siteCount} visited
                {eta ? ` · ${eta}` : ""}
              </Text>
            </Stack>

            <Box px={1}>
              <TripRouteLine trip={trip} mile={mile} size="md" motion={motion} />
            </Box>

            {context !== trip.mapTitle && context !== title ? (
              <Text fontSize="sm">{context}</Text>
            ) : null}
          </Stack>
        </Card.Body>
      </Card.Root>

      <ScrollArea.Root size="sm" variant="hover" flex="1 1 auto" minH={0} height="100%">
        <ScrollShadowViewport ref={scrollRef} height="100%">
          <ScrollArea.Content ref={contentRef}>
            <Stack gap={3} pb={2}>
              {tripLog(trip).map((row) =>
                row.kind === "event" ? (
                  <EventRow key={row.key} event={row.event} />
                ) : (
                  <Stack key={row.key} gap={2}>
                    <SiteRow
                      trip={trip}
                      site={row.site}
                      mile={mile}
                      onOpen={
                        row.site.state === "unrevealed" || !pluginName
                          ? undefined
                          : () =>
                              openDetail({
                                kind: "plugin",
                                pluginName,
                                view: "road-trip-site-detail",
                                title: row.site.name ?? "Site",
                                params: { siteId: row.site.id, tripKey },
                              })
                      }
                    />
                    {row.site.narrative && row.site.visitedAt !== undefined ? (
                      <Text fontSize="sm" whiteSpace="pre-wrap" px={3} pb={1}>
                        {row.site.narrative}
                      </Text>
                    ) : null}
                  </Stack>
                ),
              )}
            </Stack>
          </ScrollArea.Content>
        </ScrollShadowViewport>
        <ScrollArea.Scrollbar>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </Stack>
  )
}

function EventRow({ event }: { event: TripStoreEvent }) {
  return (
    <HStack gap={3} px={3} fontSize="sm">
      <Text flex={1} minW={0}>
        {event.text}
      </Text>
      <Text fontSize="xs" color="fg.muted" flexShrink={0}>
        {formatClock(event.at)}
      </Text>
    </HStack>
  )
}
