import type { ReactNode } from "react"
import { Badge, Button, HStack, Progress, Stack, Text } from "@chakra-ui/react"
import {
  gasCost,
  PART_SLOTS,
  roadTripItemId,
  VAN_PARTS,
  vanPart,
  type TripStore,
} from "@repo/road-trip-map"
import type { RoadTripVanPanelComponentProps } from "../../../../types/PluginComponent"
import { formatCountdown } from "../../../../lib/formatCountdown"
import {
  DEFAULT_TRIP_KEY,
  type FuelView,
  formatMiles,
  fuelView,
  nextGasSite,
  scaledGasPrice,
  siteLabel,
  useInterpolatedVanMile,
  useTripStore,
  vanItemName,
} from "./tripView"
import { useVanItems } from "./useVanItems"

const FUNDS_COPY: Record<TripStore["funds"]["mode"], { label: string; detail: string }> = {
  automatic: {
    label: "Automatic",
    detail: "Gas and repairs are split across everyone online by wealth.",
  },
  voluntary: {
    label: "Voluntary",
    detail: "A pool opens for each gas stop or repair. Chip in to help cover it.",
  },
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={2} p={3} borderRadius="md" borderWidth="1px">
      <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" color="fg.muted">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function NextGasLine({ trip, mile, fuel }: { trip: TripStore; mile: number; fuel: FuelView }) {
  const live = trip.live
  if (live?.kind === "fund" && live.purpose === "gas") {
    const station = trip.sites.find((s) => s.id === live.siteId)
    return (
      <Text fontSize="sm">
        Filling up{station ? <> at <b>{siteLabel(station)}</b></> : null} · {live.cost} coins
      </Text>
    )
  }
  const site = nextGasSite(trip, mile)
  if (!site) {
    const mysteryAhead = trip.sites.some((s) => s.mile > mile && s.state === "unrevealed")
    return (
      <Text fontSize="sm" color="fg.muted">
        {mysteryAhead ? "No gas in sight yet." : "No more gas on the route."}
      </Text>
    )
  }
  const away = site.mile - mile
  if (site.state === "unrevealed" || site.gasPrice === undefined) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Next gas: {siteLabel(site)} in {formatMiles(away)} mi
      </Text>
    )
  }
  const burnToSite = away * trip.fuel.drivingGallonsPerMile
  const fillGallons = Math.min(fuel.tank, fuel.tank - fuel.gallons + burnToSite)
  const estimate = gasCost(fillGallons, site.gasPrice, trip.costScale)
  const reachable = fuel.rangeMiles === null || fuel.rangeMiles >= away
  return (
    <Stack gap={0}>
      <Text fontSize="sm">
        Next gas: <b>{siteLabel(site)}</b> in {formatMiles(away)} mi
      </Text>
      <Text fontSize="xs" color={reachable ? "fg.muted" : "red.fg"}>
        {scaledGasPrice(trip, site.gasPrice)} coins/gal · about {estimate} coins to fill up
        {reachable ? "" : " · not enough gas to get there"}
      </Text>
    </Stack>
  )
}

function factorLabel(factor: number): string {
  return `×${Math.round(factor * 100) / 100}`
}

const PART_IDS = VAN_PARTS.map((part) => roadTripItemId(part.shortId))

function SpeedSection({ trip }: { trip: TripStore }) {
  const sheet = trip.vanSheet
  const moving = trip.van.mph > 0
  return (
    <Section title="Speed">
      <Text fontSize="sm">
        {moving ? `${Math.round(trip.van.mph)} mph` : "Stopped"}
        {moving && Math.abs(trip.van.mph - sheet.cruisingMph) > 0.5
          ? ` (cruising ${Math.round(sheet.cruisingMph)})`
          : ""}
      </Text>
      {sheet.speedFactors.length > 0 ? (
        <Text fontSize="xs" color="fg.muted">
          {Math.round(sheet.baseMph)} mph base
          {sheet.speedFactors.map((f) => ` · ${f.label} ${factorLabel(f.factor)}`).join("")}
        </Text>
      ) : null}
      {sheet.mpgFactors.length > 0 ? (
        <Text fontSize="xs" color="fg.muted">
          Fuel economy
          {sheet.mpgFactors.map((f) => ` · ${f.label} ${factorLabel(f.factor)}`).join("")}
        </Text>
      ) : null}
    </Section>
  )
}

function ModsSection({ trip }: { trip: TripStore }) {
  const { held, pendingItemId, use } = useVanItems(PART_IDS)
  const installed = new Map(trip.vanSheet.parts.map((part) => [part.slot, part]))
  const canInstall = trip.status === "loaded" || trip.status === "driving"
  return (
    <Section title="Mods">
      <Stack gap={1}>
        {PART_SLOTS.map(({ slot, label }) => {
          const part = installed.get(slot)
          return (
            <HStack key={slot} justify="space-between" fontSize="sm">
              <Text color="fg.muted" minW="90px">
                {label}
              </Text>
              <Text flex={1} truncate>
                {part ? `${part.emoji} ${part.name}` : "—"}
              </Text>
              {part?.installedBy ? (
                <Text fontSize="xs" color="fg.muted">
                  by {part.installedBy}
                </Text>
              ) : null}
            </HStack>
          )
        })}
      </Stack>
      {canInstall && held.length > 0 ? (
        <Stack gap={1} pt={1}>
          {held.map((item) => {
            const part = vanPart(item.definitionId.split(":").pop() ?? "")
            if (!part) return null
            const sameInstalled = installed.get(part.slot)?.partId === part.shortId
            return (
              <HStack key={item.itemId} justify="space-between">
                <Text fontSize="xs">
                  {part.emoji} {part.name}
                  {installed.get(part.slot) && !sameInstalled ? " (replaces current)" : ""}
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={sameInstalled}
                  loading={pendingItemId === item.itemId}
                  onClick={() => use(item)}
                >
                  {sameInstalled ? "Installed" : "Install"}
                </Button>
              </HStack>
            )
          })}
        </Stack>
      ) : null}
    </Section>
  )
}

function IncidentSection({ trip, now }: { trip: TripStore; now: number }) {
  const incident = trip.vanSheet.incident
  const { held, pendingItemId, use } = useVanItems(incident?.resolvesWith ?? [])
  if (!incident && trip.vanSheet.queued === 0) return null
  return (
    <Section title="Incident">
      {incident ? (
        <>
          <Text fontSize="sm" fontWeight="medium">
            {incident.emoji} {incident.name}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {incident.step}
            {incident.endsAt !== undefined
              ? ` · ${formatCountdown(Math.max(0, incident.endsAt - now))}`
              : ""}
          </Text>
          {held.map((item) => (
            <Button
              key={item.itemId}
              size="sm"
              colorPalette="green"
              loading={pendingItemId === item.itemId}
              onClick={() => use(item)}
            >
              Use {vanItemName(item.definitionId)}
            </Button>
          ))}
          {held.length === 0 && incident.resolvesWith.length > 0 ? (
            <Text fontSize="xs" color="fg.muted">
              A {incident.resolvesWith.map(vanItemName).join(" or ")} would fix this.
            </Text>
          ) : null}
        </>
      ) : null}
      {trip.vanSheet.queued > 0 ? (
        <Text fontSize="xs" color="fg.muted">
          {trip.vanSheet.queued} more waiting until the van's moving.
        </Text>
      ) : null}
    </Section>
  )
}

/** Van tab body (M7): incident, speed breakdown, mods, gas, and funds. */
export function RoadTripVanPanelTemplateComponent({
  tripKey = DEFAULT_TRIP_KEY,
}: RoadTripVanPanelComponentProps) {
  const trip = useTripStore(tripKey)
  const { mile, gallons, now } = useInterpolatedVanMile(trip)

  if (!trip) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No trip loaded.
      </Text>
    )
  }

  const fuel = fuelView(trip, gallons)
  const percent = Math.round(fuel.fraction * 100)
  const palette = fuel.empty ? "red" : fuel.low ? "orange" : "green"
  const funds = FUNDS_COPY[trip.funds.mode]

  return (
    <Stack gap={3}>
      <IncidentSection trip={trip} now={now} />
      <SpeedSection trip={trip} />
      <ModsSection trip={trip} />

      <Section title="Gas">
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="medium">
            ⛽ {percent}%
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {formatMiles(fuel.gallons)} / {formatMiles(fuel.tank)} gal
            {fuel.rangeMiles !== null ? ` · ${formatMiles(fuel.rangeMiles)} mi range` : ""}
          </Text>
        </HStack>
        <Progress.Root
          value={percent}
          max={100}
          size="sm"
          colorPalette={palette}
          aria-label={`Gas ${percent}%`}
        >
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
        {fuel.empty ? (
          <Text fontSize="xs" color="red.fg">
            Running on fumes.
          </Text>
        ) : fuel.low ? (
          <Text fontSize="xs" color="orange.fg">
            Low fuel.
          </Text>
        ) : null}
        <NextGasLine trip={trip} mile={mile} fuel={fuel} />
      </Section>

      <Section title="Funds">
        <HStack gap={2}>
          <Badge>{funds.label}</Badge>
          <Text fontSize="xs" color="fg.muted">
            {funds.detail}
          </Text>
        </HStack>
      </Section>
    </Stack>
  )
}
