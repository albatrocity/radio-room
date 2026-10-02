import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react"
import type { TripStore, TripStoreSite } from "@repo/road-trip-map"
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
  useInterpolatedVanMile,
  useTripStore,
} from "./tripView"

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
      opacity={site.state === "skipped" ? 0.65 : 1}
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

/** Trip tab body: route, live context, "3 / 7 visited", and the site list (M7). */
export function RoadTripTripPanelTemplateComponent({
  tripKey = DEFAULT_TRIP_KEY,
}: RoadTripTripPanelComponentProps) {
  const { pluginName } = usePluginComponentContext()
  const trip = useTripStore(tripKey)
  const { mile, now } = useInterpolatedVanMile(trip)
  const openDetail = useOpenTabDetail(`${pluginName ?? "road-trip"}:trip`)

  if (!trip) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No trip loaded.
      </Text>
    )
  }

  const badge = STATUS_BADGE[trip.status]
  const eta = etaLine(trip)

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <HStack justify="space-between" align="center">
          <Text fontWeight="bold" fontSize="md" truncate>
            {trip.mapTitle}
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
        <TripRouteLine trip={trip} mile={mile} size="md" />
      </Box>

      <Text fontSize="sm">{stripContext(trip, mile, now)}</Text>

      <Stack gap={2}>
        {trip.sites.map((site) => (
          <SiteRow
            key={site.id}
            trip={trip}
            site={site}
            mile={mile}
            onOpen={
              site.state === "unrevealed" || !pluginName
                ? undefined
                : () =>
                    openDetail({
                      kind: "plugin",
                      pluginName,
                      view: "road-trip-site-detail",
                      title: site.name ?? "Site",
                      params: { siteId: site.id, tripKey },
                    })
            }
          />
        ))}
      </Stack>
    </Stack>
  )
}
