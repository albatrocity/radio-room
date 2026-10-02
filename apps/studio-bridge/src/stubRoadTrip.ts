/**
 * Road Trip fixtures for Game Studio → Listening Room preview (Phase 1).
 * The real plugin does not run in the sandbox; these snapshots exercise the
 * strip, the Trip tab, road-sign messages, and the road-sign skip poll.
 */
import type { ChatMessage } from "@repo/types/ChatMessage"
import type { Poll } from "@repo/types/Poll"
import {
  SAMPLE_TRIP_MAP as SAMPLE_TRIP_MAP_INPUT,
  routeMiles as mapRouteMiles,
  tripMapSchema,
  type TripStore,
  type TripStoreSite,
} from "@repo/road-trip-map"

export const ROAD_TRIP_PREVIEW_PLUGIN = "road-trip"

const MIN = 60_000
const SAMPLE_TRIP_MAP = tripMapSchema.parse(SAMPLE_TRIP_MAP_INPUT)

export type RoadTripFixture = "driving" | "parked" | "arrived"

const fixtures = new Map<string, { fixture: RoadTripFixture; at: number }>()

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
    ...(site.shop?.shopIds?.length ? { shopTitle: site.shop.title ?? site.name } : {}),
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
export function buildRoadTripFixture(fixture: RoadTripFixture, at: number): TripStore {
  const routeMiles = mapRouteMiles(SAMPLE_TRIP_MAP.route)
  const base = {
    tripId: "trip-studio-preview",
    mapTitle: SAMPLE_TRIP_MAP.title,
    routeMiles,
    siteCount: SAMPLE_TRIP_MAP.sites.length,
  }

  if (fixture === "parked") {
    const departedAt = at - 8 * MIN
    return {
      ...base,
      status: "driving",
      sites: [
        revealed("record-store", "skipped", { votes: { stop: 1, skip: 4 } }),
        revealed("farmers-market", "visited", { visitedAt: at, lore: loreFor("farmers-market") }),
        unrevealed("concert"),
      ],
      van: { anchorAt: at, anchorMile: 8, mph: 0 },
      eta: { projectedArrivalAt: at + 8 * MIN, targetArrivalAt: departedAt + 12 * MIN },
      live: {
        kind: "parked",
        label: "Farmers Market",
        siteId: "farmers-market",
        endsAt: at + 4 * MIN,
        shopOpen: true,
      },
      departedAt,
      visitedCount: 1,
    }
  }

  if (fixture === "arrived") {
    const departedAt = at - 16 * MIN
    return {
      ...base,
      status: "late",
      sites: [
        revealed("record-store", "skipped", { votes: { stop: 1, skip: 4 } }),
        revealed("farmers-market", "visited", {
          visitedAt: at - 8 * MIN,
          lore: loreFor("farmers-market"),
        }),
        revealed("concert", "visited", { visitedAt: at, lore: loreFor("concert") }),
      ],
      van: { anchorAt: at, anchorMile: routeMiles, mph: 0 },
      eta: { projectedArrivalAt: at, targetArrivalAt: departedAt + 12 * MIN },
      departedAt,
      arrivedAt: at,
      visitedCount: 2,
    }
  }

  const departedAt = at - 2.5 * MIN
  return {
    ...base,
    status: "driving",
    sites: [
      revealed("record-store", "polling"),
      unrevealed("farmers-market"),
      unrevealed("concert"),
    ],
    van: { anchorAt: at, anchorMile: 2.5, mph: SAMPLE_TRIP_MAP.route.baseMph },
    eta: { projectedArrivalAt: at + 13.5 * MIN, targetArrivalAt: departedAt + 12 * MIN },
    departedAt,
    visitedCount: 0,
  }
}

const STATUS_LINES: Record<RoadTripFixture, Record<string, string>> = {
  driving: {
    tripProgress: "Driving · Concert Run · 2.5 / 12 mi · 0 / 3 visited",
    tripEta: "4 min behind target",
    tripNextSite: "Dusty Boots Records · mile 4",
    tripWarnings: "None",
  },
  parked: {
    tripProgress: "Driving · Concert Run · 8 / 12 mi · 1 / 3 visited",
    tripEta: "4 min behind target",
    tripNextSite: "? · mile 12",
    tripWarnings: "None",
  },
  arrived: {
    tripProgress: "Arrived late · Concert Run · 12 / 12 mi · 2 / 3 visited",
    tripEta: "4 min behind target",
    tripNextSite: "—",
    tripWarnings: "Arrived at The Concert: activate the next segment",
  },
}

function storePayload(entry: { fixture: RoadTripFixture; at: number } | undefined) {
  if (!entry) {
    return {
      tripActive: false,
      trip: null,
      tripProgress: "No map loaded",
      tripEta: "—",
      tripNextSite: "—",
      tripWarnings: "None",
    }
  }
  return {
    tripActive: true,
    trip: buildRoadTripFixture(entry.fixture, entry.at),
    ...STATUS_LINES[entry.fixture],
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
  const entry = { fixture, at: Date.now() }
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

function sign(
  content: string,
  title: string,
  status: "info" | "warning",
  icon: string,
  at: number,
): ChatMessage {
  return {
    user: { userId: "system", username: "system", id: "system" },
    content,
    timestamp: new Date(at).toISOString(),
    meta: { type: "alert", status, title, theme: "road-trip", icon },
  } as ChatMessage
}

/** Road-sign system messages (info + warning) for the preview chat. */
export function buildStubRoadTripSigns(now = Date.now()): ChatMessage[] {
  return [
    sign("12 mi to The Concert.", "On the road · Concert Run", "info", "🚐", now - 2 * MIN),
    sign("Shop stays closed for this stop.", "Item Shops is off", "warning", "⚠️", now - MIN),
  ]
}

export function runStubRoadTripAction(
  roomId: string,
  action: string,
): {
  success: boolean
  message?: string
  events: Array<{ type: string; data: Record<string, unknown> }>
} {
  const fixtureFor: Record<string, RoadTripFixture> = {
    depart: "driving",
    resume: "driving",
    leaveNow: "driving",
    previewParked: "parked",
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
