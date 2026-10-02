/**
 * Road Trip fixtures for Game Studio → Listening Room preview (Phases 1–3).
 * The real plugin does not run in the sandbox; these snapshots exercise the
 * strip and its gas gauge, the Trip and Van tabs (mods, speed breakdown,
 * incident), the gas pool card, road-sign messages, and the road-sign skip poll.
 */
import type { ChatMessage } from "@repo/types/ChatMessage"
import type { Poll } from "@repo/types/Poll"
import type { PoolCardView } from "@repo/types/PluginComponent"
import {
  SAMPLE_TRIP_MAP as SAMPLE_TRIP_MAP_INPUT,
  INCIDENTS,
  INCIDENT_TIMING,
  baseGallonsPerMile,
  compileVan,
  gasCost,
  itemsResolving,
  roadTripItemId,
  routeMiles as mapRouteMiles,
  tripMapSchema,
  vanPart,
  type FundsMode,
  type TripStore,
  type TripStoreSite,
  type TripStoreVanSheet,
} from "@repo/road-trip-map"

export const ROAD_TRIP_PREVIEW_PLUGIN = "road-trip"

const MIN = 60_000
const SAMPLE_TRIP_MAP = tripMapSchema.parse(SAMPLE_TRIP_MAP_INPUT)
const TANK = SAMPLE_TRIP_MAP.tuning.tankGallons
const GPM = baseGallonsPerMile(SAMPLE_TRIP_MAP)
const GAS_SITE_ID = "gas-n-go"
const GAS_SITE = SAMPLE_TRIP_MAP.sites.find((s) => s.id === GAS_SITE_ID)!
const POOL_WINDOW_MS = SAMPLE_TRIP_MAP.tuning.funds.windowMinutes * MIN

export type RoadTripFixture = "driving" | "fueling" | "parked" | "incident" | "arrived"

const BASE_MPH = SAMPLE_TRIP_MAP.route.baseMph
/** Parts on the preview van: a spoiler from the start; the AAA card joins by the flat. */
const FIXTURE_PARTS: Record<RoadTripFixture, string[]> = {
  driving: ["aero-spoiler"],
  fueling: ["aero-spoiler"],
  parked: ["aero-spoiler"],
  incident: ["aero-spoiler", "aaa-card"],
  arrived: ["aero-spoiler", "aaa-card"],
}

function vanSheet(fixture: RoadTripFixture, at: number): TripStoreVanSheet {
  const partIds = FIXTURE_PARTS[fixture]
  const van = compileVan(partIds)
  const cruising = van.speedFactors.reduce((mph, f) => mph * f.factor, BASE_MPH)
  const sheet: TripStoreVanSheet = {
    parts: partIds.flatMap((id) => {
      const part = vanPart(id)
      return part
        ? [{ slot: part.slot, partId: id, name: part.name, emoji: part.emoji, installedBy: "Studio" }]
        : []
    }),
    baseMph: BASE_MPH,
    cruisingMph: cruising,
    speedFactors: van.speedFactors,
    mpgFactors: van.mpgFactors,
    queued: 0,
  }
  if (fixture === "incident") {
    sheet.incident = {
      incident: "blown-tire",
      name: INCIDENTS["blown-tire"].name,
      emoji: INCIDENTS["blown-tire"].emoji,
      step: "Waiting on the shoulder",
      stepKind: "window",
      endsAt: at + INCIDENT_TIMING.flatWindowMs,
      resolvesWith: itemsResolving("blown-tire").map(roadTripItemId),
    }
  }
  return sheet
}

function cruisingMph(fixture: RoadTripFixture): number {
  return vanSheet(fixture, 0).cruisingMph
}

export type FixtureEntry = { fixture: RoadTripFixture; at: number; raised: number }

const fixtures = new Map<string, FixtureEntry>()

/** Gallons at `mile`, filling to full at the gas site. */
function gallonsAt(mile: number): number {
  const fromMile = mile > GAS_SITE.mile ? GAS_SITE.mile : 0
  return Math.max(0, TANK - (mile - fromMile) * GPM)
}

const FILL_GALLONS = TANK - gallonsAt(GAS_SITE.mile)
const FILL_COST = gasCost(FILL_GALLONS, GAS_SITE.services!.gas!.pricePerGallon)

function fuel(mile: number, moving: boolean, at: number): TripStore["fuel"] {
  return {
    anchorAt: at,
    anchorGallons: gallonsAt(mile),
    gallonsPerMile: moving ? GPM : 0,
    drivingGallonsPerMile: GPM,
    tank: TANK,
    lowPct: SAMPLE_TRIP_MAP.tuning.lowFuelPct,
  }
}

function fundsMode(fixture: RoadTripFixture): FundsMode {
  return fixture === "fueling" ? "voluntary" : "automatic"
}

function revealed(
  siteId: string,
  state: TripStoreSite["state"],
  extra: Partial<TripStoreSite> = {},
): TripStoreSite {
  const site = SAMPLE_TRIP_MAP.sites.find((s) => s.id === siteId)!
  return {
    id: site.id,
    mile: site.mile,
    state,
    name: site.name,
    description: site.description,
    icon: site.icon,
    ...(site.imageUrl ? { imageUrl: site.imageUrl } : {}),
    ...(site.role === "destination" ? { destination: true } : {}),
    ...(site.shop?.shopIds?.length || site.shop?.offers?.length
      ? { shopTitle: site.shop.title ?? site.name }
      : {}),
    ...(site.services?.gas ? { gasPrice: site.services.gas.pricePerGallon } : {}),
    ...(site.services?.mechanic ? { mechanic: true as const } : {}),
    ...extra,
  }
}

function unrevealed(siteId: string): TripStoreSite {
  const site = SAMPLE_TRIP_MAP.sites.find((s) => s.id === siteId)!
  return { id: site.id, mile: site.mile, state: "unrevealed" }
}

function loreFor(siteId: string): string | undefined {
  return SAMPLE_TRIP_MAP.sites.find((s) => s.id === siteId)?.lore
}

/** Trip store snapshot for a fixture, anchored at `at` (departure = `at − elapsed`). */
export function buildRoadTripFixture(entry: FixtureEntry): TripStore {
  const { fixture, at } = entry
  const routeMiles = mapRouteMiles(SAMPLE_TRIP_MAP.route)
  const base = {
    tripId: "trip-studio-preview",
    mapTitle: SAMPLE_TRIP_MAP.title,
    routeMiles,
    siteCount: SAMPLE_TRIP_MAP.sites.length,
    funds: { mode: fundsMode(fixture) },
    costScale: 1,
    vanSheet: vanSheet(fixture, at),
  }

  if (fixture === "incident") {
    const departedAt = at - 15 * MIN
    const flatMile = SAMPLE_TRIP_MAP.scriptedEvents?.[0]?.atMile ?? 9
    return {
      ...base,
      status: "driving",
      sites: [
        revealed("record-store", "skipped", { votes: { stop: 1, skip: 4 } }),
        revealed(GAS_SITE_ID, "visited", { visitedAt: at - 9 * MIN }),
        revealed("farmers-market", "visited", { visitedAt: at - 5 * MIN, lore: loreFor("farmers-market") }),
        revealed("hanks-garage", "ahead"),
        unrevealed("concert"),
      ],
      van: { anchorAt: at, anchorMile: flatMile, mph: 0 },
      fuel: fuel(flatMile, false, at),
      eta: { projectedArrivalAt: at + 5 * MIN, targetArrivalAt: departedAt + 18 * MIN },
      live: {
        kind: "incident",
        label: "🛞 Blown tire · Waiting on the shoulder",
        incident: "blown-tire",
        endsAt: at + INCIDENT_TIMING.flatWindowMs,
        resolvesWith: itemsResolving("blown-tire").map(roadTripItemId),
      },
      departedAt,
      visitedCount: 2,
    }
  }

  if (fixture === "fueling") {
    const departedAt = at - 6 * MIN
    return {
      ...base,
      status: "driving",
      sites: [
        revealed("record-store", "skipped", { votes: { stop: 1, skip: 4 } }),
        revealed(GAS_SITE_ID, "parked", { votes: { stop: 3, skip: 0 } }),
        unrevealed("farmers-market"),
        unrevealed("hanks-garage"),
        unrevealed("concert"),
      ],
      van: { anchorAt: at, anchorMile: GAS_SITE.mile, mph: 0 },
      fuel: fuel(GAS_SITE.mile, false, at),
      eta: { projectedArrivalAt: at + 13 * MIN, targetArrivalAt: departedAt + 18 * MIN },
      live: {
        kind: "fund",
        label: `Gas money · ${GAS_SITE.name}`,
        purpose: "gas",
        mode: "voluntary",
        siteId: GAS_SITE_ID,
        cost: FILL_COST,
        raised: entry.raised,
        endsAt: at + POOL_WINDOW_MS,
      },
      departedAt,
      visitedCount: 0,
    }
  }

  if (fixture === "parked") {
    const departedAt = at - 11 * MIN
    const marketMile = 8
    return {
      ...base,
      status: "driving",
      sites: [
        revealed("record-store", "skipped", { votes: { stop: 1, skip: 4 } }),
        revealed(GAS_SITE_ID, "visited", { visitedAt: at - 4 * MIN }),
        revealed("farmers-market", "visited", { visitedAt: at, lore: loreFor("farmers-market") }),
        unrevealed("hanks-garage"),
        unrevealed("concert"),
      ],
      van: { anchorAt: at, anchorMile: marketMile, mph: 0 },
      fuel: fuel(marketMile, false, at),
      eta: { projectedArrivalAt: at + 8 * MIN, targetArrivalAt: departedAt + 18 * MIN },
      live: {
        kind: "parked",
        label: "Farmers Market",
        siteId: "farmers-market",
        endsAt: at + 4 * MIN,
        shopOpen: true,
      },
      departedAt,
      visitedCount: 2,
    }
  }

  if (fixture === "arrived") {
    const departedAt = at - 19 * MIN
    return {
      ...base,
      status: "late",
      sites: [
        revealed("record-store", "skipped", { votes: { stop: 1, skip: 4 } }),
        revealed(GAS_SITE_ID, "visited", { visitedAt: at - 13 * MIN }),
        revealed("farmers-market", "visited", {
          visitedAt: at - 8 * MIN,
          lore: loreFor("farmers-market"),
        }),
        revealed("hanks-garage", "skipped", { votes: { stop: 0, skip: 2 } }),
        revealed("concert", "visited", { visitedAt: at, lore: loreFor("concert") }),
      ],
      van: { anchorAt: at, anchorMile: routeMiles, mph: 0 },
      fuel: fuel(routeMiles, false, at),
      eta: { projectedArrivalAt: at, targetArrivalAt: departedAt + 18 * MIN },
      departedAt,
      arrivedAt: at,
      visitedCount: 3,
    }
  }

  const departedAt = at - 2.5 * MIN
  const mile = 2.5
  return {
    ...base,
    status: "driving",
    sites: [
      revealed("record-store", "polling"),
      unrevealed(GAS_SITE_ID),
      unrevealed("farmers-market"),
      unrevealed("hanks-garage"),
      unrevealed("concert"),
    ],
    van: { anchorAt: at, anchorMile: mile, mph: cruisingMph("driving") },
    fuel: fuel(mile, true, at),
    eta: { projectedArrivalAt: at + 16.5 * MIN, targetArrivalAt: departedAt + 18 * MIN },
    departedAt,
    visitedCount: 0,
  }
}

const STATUS_LINES: Record<RoadTripFixture, Record<string, string>> = {
  driving: {
    tripProgress: "Driving · Concert Run · 2.5 / 12 mi · 0 / 5 visited",
    tripEta: "1 min behind target",
    tripNextSite: "Dusty Boots Records · mile 4",
    tripFuel: "Gas 63% · Funds: automatic (split by wealth)",
    tripWarnings: "None",
  },
  fueling: {
    tripProgress: "Driving · Concert Run · 6 / 12 mi · 0 / 5 visited",
    tripEta: "1 min behind target",
    tripNextSite: "? · mile 8",
    tripFuel: "Gas 10% · Funds: voluntary (chip in)",
    tripWarnings: "Gas pool open",
  },
  parked: {
    tripProgress: "Driving · Concert Run · 8 / 12 mi · 2 / 5 visited",
    tripEta: "1 min behind target",
    tripNextSite: "? · mile 12",
    tripFuel: "Gas 70% · Funds: automatic (split by wealth)",
    tripWarnings: "None",
  },
  incident: {
    tripProgress: "Driving · Concert Run · 9 / 12 mi · 2 / 5 visited",
    tripEta: "On target",
    tripNextSite: "Hank's Garage · mile 10",
    tripFuel: "Gas 55% · Funds: automatic (split by wealth)",
    tripWarnings: "Blown tire: Waiting on the shoulder",
  },
  arrived: {
    tripProgress: "Arrived late · Concert Run · 12 / 12 mi · 3 / 5 visited",
    tripEta: "1 min behind target",
    tripNextSite: "—",
    tripFuel: "Gas 10% · Funds: automatic (split by wealth)",
    tripWarnings: "Arrived at The Concert: activate the next segment",
  },
}

function poolView(entry: FixtureEntry): PoolCardView {
  return {
    id: "studio-bridge-gas-pool",
    title: `Gas money · ${GAS_SITE.name}`,
    icon: "⛽",
    eyebrow: "Road Trip · Gas money",
    subtitle: `${Math.round(FILL_GALLONS * 10) / 10} gal at ${GAS_SITE.name}`,
    body: "The van fills up either way. Chip in so the attendant isn't left short.",
    goal: FILL_COST,
    raised: entry.raised,
    startedAt: entry.at,
    endsAt: entry.at + POOL_WINDOW_MS,
    open: entry.raised < FILL_COST,
    topContributors: entry.raised > 0 ? [{ name: "Studio", amount: entry.raised }] : [],
  }
}

function storePayload(entry: FixtureEntry | undefined) {
  if (!entry) {
    return {
      tripActive: false,
      trip: null,
      tripProgress: "No map loaded",
      tripEta: "—",
      tripNextSite: "—",
      tripFuel: "—",
      tripWarnings: "None",
      tripPool: null,
      tripPoolOpen: false,
    }
  }
  const pool = entry.fixture === "fueling" ? poolView(entry) : null
  return {
    tripActive: true,
    trip: buildRoadTripFixture(entry),
    ...STATUS_LINES[entry.fixture],
    tripPool: pool,
    tripPoolOpen: pool?.open ?? false,
  }
}

/** Late-joiner hydration for `GET .../plugins/road-trip/components`. */
export function buildStubRoadTripComponentState(roomId: string): Record<string, unknown> {
  return storePayload(fixtures.get(roomId))
}

export function startStubRoadTrip(
  roomId: string,
  fixture: RoadTripFixture = "driving",
): { type: string; data: Record<string, unknown> } {
  const entry = { fixture, at: Date.now(), raised: fixture === "fueling" ? 36 : 0 }
  fixtures.set(roomId, entry)
  return { type: "PLUGIN:road-trip:TRIP_UPDATED", data: storePayload(entry) }
}

/** Themed skip poll (Poll.presentation, ADR 0203) matching the driving fixture. */
export function buildStubRoadTripPoll(roomId: string): Poll {
  const now = Date.now()
  return {
    id: "studio-bridge-road-trip-poll",
    roomId,
    question: "Dusty Boots Records in 2 miles: pull off?",
    options: [
      { id: "trip-opt-stop", label: "Pull off" },
      { id: "trip-opt-skip", label: "Keep driving" },
    ],
    status: "open",
    settings: { hideRunningTotal: false },
    createdAt: now,
    createdBy: "studio-bridge",
    publishedAt: now,
    closedAt: null,
    closesAt: now + 45_000,
    presentation: {
      theme: "road-trip",
      variant: "info",
      eyebrow: "EXIT 4",
      headline: "DUSTY BOOTS RECORDS",
      icon: "📀",
      footnote: "No votes = keep driving",
    },
  }
}

type SignStatus = "info" | "success" | "warning" | "error"

function sign(content: string, title: string, status: SignStatus, icon: string, at: number) {
  return {
    user: { userId: "system", username: "system", id: "system" },
    content,
    timestamp: new Date(at).toISOString(),
    meta: { type: "alert", status, title, theme: "road-trip", icon },
  } as ChatMessage
}

/** Road-sign system messages (all four variants) for the preview chat. */
export function buildStubRoadTripSigns(now = Date.now()): ChatMessage[] {
  return [
    sign("12 mi to The Concert.", "On the road · Concert Run", "info", "🚐", now - 4 * MIN),
    sign("Next gas: Gas 'n' Go, mile 6.", "Low fuel · 15%", "warning", "⛽", now - 3 * MIN),
    sign(
      `${Math.round(FILL_GALLONS * 10) / 10} gal for ${FILL_COST} coins.`,
      "Filled up at Gas 'n' Go",
      "success",
      "⛽",
      now - 2 * MIN,
    ),
    sign("Anyone holding a Fix-a-Flat? Otherwise roadside service.", "Blown tire", "error", "🛞", now - MIN),
  ]
}

export function runStubRoadTripAction(
  roomId: string,
  action: string,
  params?: Record<string, unknown>,
): {
  success: boolean
  message?: string
  events: Array<{ type: string; data: Record<string, unknown> }>
} {
  const fixtureFor: Record<string, RoadTripFixture> = {
    depart: "driving",
    resume: "driving",
    leaveNow: "driving",
    previewFueling: "fueling",
    previewParked: "parked",
    previewIncident: "incident",
    triggerIncident: "incident",
    skipIncidentStep: "driving",
    previewArrived: "arrived",
  }
  const fixture = fixtureFor[action]
  if (fixture) {
    return {
      success: true,
      message: `Road trip preview: ${fixture}.`,
      events: [startStubRoadTrip(roomId, fixture)],
    }
  }
  if (action === "chipIn") {
    const entry = fixtures.get(roomId)
    if (entry?.fixture !== "fueling" || entry.raised >= FILL_COST) {
      return { success: false, message: "No gas pool is open.", events: [] }
    }
    const amount = Math.floor(Number(params?.amount ?? 0))
    if (!(amount > 0)) return { success: false, message: "Enter a whole number of coins.", events: [] }
    entry.raised = Math.min(FILL_COST, entry.raised + amount)
    return {
      success: true,
      message:
        entry.raised >= FILL_COST
          ? "That covers it. Filling up!"
          : `Thanks! ${entry.raised} / ${FILL_COST} coins.`,
      events: [{ type: "PLUGIN:road-trip:TRIP_UPDATED", data: storePayload(entry) }],
    }
  }
  if (action === "endTrip" || action === "unloadMap" || action === "newTrip") {
    fixtures.delete(roomId)
    return {
      success: true,
      message: "Road trip preview cleared.",
      events: [{ type: "PLUGIN:road-trip:TRIP_UPDATED", data: storePayload(undefined) }],
    }
  }
  return { success: false, message: `Road trip preview doesn't support ${action}.`, events: [] }
}
