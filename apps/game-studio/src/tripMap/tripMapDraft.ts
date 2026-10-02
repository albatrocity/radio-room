import {
  GENERIC_SITE_PRESETS,
  INCIDENTS,
  SAMPLE_TRIP_MAP,
  TRIGGERABLE_INCIDENT_IDS,
  VAN_CONSUMABLES,
  VAN_PARTS,
  fuelPlan,
  gasCost,
  formatShare,
  incidentCostEstimate,
  levyRate,
  isDestination,
  parkPlan,
  parseTripMap,
  roadTripItemId,
  routeMiles,
  siteFromPreset,
  sitePresetForShop,
  tripMapSchema,
  type IncidentCostLine,
  type ParseTripMapResult,
  type TriggerableIncidentId,
  type SitePreset,
  type TripMap,
  type TripMapInput,
  type TripSite,
} from "@repo/road-trip-map"
import {
  ITEM_CATALOG,
  RECORD_STORE_SHOP,
  SHOP_CATALOG,
  validateRoomShopRequest,
} from "@repo/plugin-item-shops"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"

const DRAFT_STORAGE_KEY = "game-studio:trip-map-draft"

export type TripSiteDraft = TripMapInput["sites"][number]

/** Catalog shops plus Record Store, which Item Shops only stocks on the Media Bridge. */
export const SHOP_OPTIONS: { shopId: string; name: string }[] = [
  ...SHOP_CATALOG,
  RECORD_STORE_SHOP,
].map((shop) => ({ shopId: shop.shopId, name: shop.name }))

const KNOWN_SHOP_IDS = new Set(SHOP_OPTIONS.map((s) => s.shopId))
const EVERYWHERE_SHOP_IDS = new Set(SHOP_CATALOG.map((s) => s.shopId))

/** Site library: generic presets plus one roadside stand per Item Shops shop. */
export const SITE_LIBRARY: SitePreset[] = [
  ...GENERIC_SITE_PRESETS,
  ...SHOP_OPTIONS.map((shop) =>
    sitePresetForShop(
      shop.shopId === RECORD_STORE_SHOP.shopId
        ? { ...shop, icon: "📀", description: "Crates of used records and playback gear." }
        : shop,
    ),
  ),
]

export function loadDraft(): TripMapInput {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as TripMapInput
  } catch {
    // Corrupt draft: start from the sample.
  }
  return structuredClone(SAMPLE_TRIP_MAP)
}

export function saveDraft(draft: TripMapInput): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Storage full or disabled: the draft just isn't remembered.
  }
}

/** The offers picker: road-trip parts and consumables (Item Shops items validate too, hand-edited). */
export const OFFER_OPTIONS: { definitionId: string; name: string; emoji: string; coinValue: number }[] =
  [...VAN_PARTS, ...VAN_CONSUMABLES].map((item) => ({
    definitionId: roadTripItemId(item.shortId),
    name: item.name,
    emoji: item.emoji,
    coinValue: item.coinValue,
  }))

const KNOWN_DEFINITION_IDS = new Set([
  ...OFFER_OPTIONS.map((o) => o.definitionId),
  ...ITEM_CATALOG.map((entry) => `${ITEM_SHOPS_PLUGIN_NAME}:${entry.definition.shortId}`),
])

/** Item Shops' own check, with only Record Store treated as room-dependent. */
export function validateCatalogShop(req: { shopIds?: string[]; offers?: { definitionId: string }[] }) {
  return validateRoomShopRequest(req, {
    shopIds: KNOWN_SHOP_IDS,
    availableShopIds: EVERYWHERE_SHOP_IDS,
    definitionIds: KNOWN_DEFINITION_IDS,
  })
}

export function parseDraft(draft: TripMapInput, departAt: number): ParseTripMapResult {
  return parseTripMap(draft, {
    validateShop: validateCatalogShop,
    departAt,
    assetBaseUrl: import.meta.env.VITE_ASSET_CDN_BASE_URL || undefined,
  })
}

/** Schema defaults applied, or null while the draft doesn't parse. */
export function resolvedMap(draft: TripMapInput): TripMap | null {
  const parsed = tripMapSchema.safeParse(draft)
  return parsed.success ? parsed.data : null
}

export function draftRouteMiles(draft: TripMapInput): number {
  return routeMiles({
    driveMinutes: draft.route.driveMinutes,
    baseMph: draft.route.baseMph ?? 55,
    tanksPerTrip: draft.route.tanksPerTrip ?? 1.6,
  })
}

function roundMile(mile: number): number {
  return Math.round(mile * 10) / 10
}

/** Keep the destination pinned to the end of the route after route edits. */
export function pinDestination(draft: TripMapInput): TripMapInput {
  const end = roundMile(draftRouteMiles(draft))
  return {
    ...draft,
    sites: draft.sites.map((site) => (isDestination(site) ? { ...site, mile: end } : site)),
  }
}

export function updateRoute(
  draft: TripMapInput,
  patch: Partial<TripMapInput["route"]>,
): TripMapInput {
  return pinDestination({ ...draft, route: { ...draft.route, ...patch } })
}

export type TripTuningDraft = NonNullable<TripMapInput["tuning"]>

export function updateTuning(draft: TripMapInput, patch: Partial<TripTuningDraft>): TripMapInput {
  return { ...draft, tuning: { ...draft.tuning, ...patch } }
}

export function updateFunds(
  draft: TripMapInput,
  patch: Partial<NonNullable<TripTuningDraft["funds"]>>,
): TripMapInput {
  return updateTuning(draft, { funds: { ...draft.tuning?.funds, ...patch } })
}

export function updateSite(
  draft: TripMapInput,
  siteId: string,
  patch: Partial<TripSiteDraft>,
): TripMapInput {
  return {
    ...draft,
    sites: draft.sites.map((site) => (site.id === siteId ? { ...site, ...patch } : site)),
  }
}

export function moveSite(draft: TripMapInput, siteId: string, mile: number): TripMapInput {
  const end = draftRouteMiles(draft)
  const site = draft.sites.find((s) => s.id === siteId)
  if (!site || isDestination(site)) return draft
  return updateSite(draft, siteId, { mile: roundMile(Math.min(Math.max(0.1, mile), end - 0.1)) })
}

export function removeSite(draft: TripMapInput, siteId: string): TripMapInput {
  return { ...draft, sites: draft.sites.filter((s) => s.id !== siteId) }
}

function uniqueSiteId(draft: TripMapInput, base: string): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "site"
  const taken = new Set(draft.sites.map((s) => s.id))
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`
}

/** Add a library preset: destinations go at the end, other sites in the widest gap. */
export function addSiteFromPreset(
  draft: TripMapInput,
  preset: SitePreset,
): { draft: TripMapInput; siteId: string } {
  const end = draftRouteMiles(draft)
  const id = uniqueSiteId(draft, preset.site.name)
  let mile = end
  if (!isDestination(preset.site)) {
    const stops = [0, ...draft.sites.map((s) => s.mile).sort((a, b) => a - b), end]
    let best = { gap: -1, at: end / 2 }
    for (let i = 1; i < stops.length; i++) {
      const gap = stops[i]! - stops[i - 1]!
      if (gap > best.gap) best = { gap, at: (stops[i]! + stops[i - 1]!) / 2 }
    }
    mile = best.at
  }
  const site = siteFromPreset(preset, id, roundMile(mile)) as TripSiteDraft
  return { draft: { ...draft, sites: [...draft.sites, site] }, siteId: id }
}

export type TripProjection = {
  routeMiles: number
  driveMinutes: number
  /** Every optional stop skipped. */
  fastestMinutes: number
  /** Every skip poll resolves to its default. */
  defaultMinutes: number
  /** Every optional stop taken. */
  slowestMinutes: number
  /** Deadline minus planned departure, when a deadline is set. */
  deadlineMinutes: number | null
}

export type FuelProjectionStop = {
  siteId: string
  name: string
  icon: string
  mile: number
  /** 0–1 share of a tank on arrival. */
  arrivalPct: number
  stops: boolean
  gallons: number
  /** Coins at the chosen `costScale`. */
  cost: number
}

export type FuelProjection = {
  points: { mile: number; gallons: number }[]
  tankGallons: number
  lowPct: number
  stops: FuelProjectionStop[]
  totalCost: number
  lowAtMile: number | null
  emptyAtMile: number | null
}

/** No-vote fuel curve and gas bill (`fuelPlan`), with costs scaled for a preview economy. */
export function projectFuel(map: TripMap, costScale: number): FuelProjection {
  const plan = fuelPlan(map)
  const byId = new Map(map.sites.map((s) => [s.id, s]))
  const stops = plan.gasStops.map((stop) => {
    const site = byId.get(stop.siteId)!
    return {
      siteId: stop.siteId,
      name: site.name,
      icon: site.icon,
      mile: stop.mile,
      arrivalPct: plan.tankGallons > 0 ? stop.gallonsOnArrival / plan.tankGallons : 0,
      stops: stop.stops,
      gallons: stop.gallons,
      cost: stop.stops
        ? gasCost(stop.gallons, site.services!.gas!.pricePerGallon, costScale)
        : 0,
    }
  })
  return {
    points: plan.points,
    tankGallons: plan.tankGallons,
    lowPct: map.tuning.lowFuelPct,
    stops,
    totalCost: stops.reduce((sum, s) => sum + s.cost, 0),
    lowAtMile: plan.lowAtMile,
    emptyAtMile: plan.emptyAtMile,
  }
}

export type ScriptedEventDraft = NonNullable<TripMapInput["scriptedEvents"]>[number]

export function addScriptedEvent(draft: TripMapInput, incident: TriggerableIncidentId): TripMapInput {
  const events = draft.scriptedEvents ?? []
  const taken = new Set(events.map((e) => e.id))
  let id = incident
  for (let n = 2; taken.has(id); n++) id = `${incident}-${n}` as TriggerableIncidentId
  const atMile = roundMile(draftRouteMiles(draft) / 2)
  return { ...draft, scriptedEvents: [...events, { id, atMile, incident }] }
}

export function updateScriptedEvent(
  draft: TripMapInput,
  eventId: string,
  patch: Partial<ScriptedEventDraft>,
): TripMapInput {
  return {
    ...draft,
    scriptedEvents: (draft.scriptedEvents ?? []).map((e) =>
      e.id === eventId ? { ...e, ...patch } : e,
    ),
  }
}

export function removeScriptedEvent(draft: TripMapInput, eventId: string): TripMapInput {
  const events = (draft.scriptedEvents ?? []).filter((e) => e.id !== eventId)
  const { scriptedEvents: _drop, ...rest } = draft
  return events.length > 0 ? { ...rest, scriptedEvents: events } : rest
}

export type IncidentEstimate = {
  incident: TriggerableIncidentId
  name: string
  emoji: string
  lines: IncidentCostLine[]
  total: number
}

/** What each triggerable incident would charge at `mile`, at the preview economy (no parts). */
export function estimateIncidents(map: TripMap, mile: number, costScale: number): IncidentEstimate[] {
  return TRIGGERABLE_INCIDENT_IDS.map((incident) => {
    const lines = incidentCostEstimate(map, incident, mile, costScale)
    return {
      incident,
      name: INCIDENTS[incident].name,
      emoji: INCIDENTS[incident].emoji,
      lines,
      total: lines.reduce((sum, l) => sum + l.cost, 0),
    }
  })
}

/**
 * Default "room wallets" estimate for cost previews: 12 travelers × 500 coins.
 * A guess by design; the designer tunes it to the room they expect.
 */
export const DEFAULT_PREVIEW_WALLETS = 12 * 500

/**
 * How a cost lands under the automatic levy (D16): the same share of every
 * wallet, as players see it in their notice ("≈ 5.8% of wallets").
 */
export function walletShareLabel(cost: number, walletsTotal: number): string {
  const rate = levyRate(cost, walletsTotal)
  if (rate >= 1) return "empties every wallet; the room can't cover it"
  return `≈ ${formatShare(rate)} of wallets`
}

/** The whole trip's costs against the room's wallets, ignoring what travelers earn on the way. */
export function tripShareLabel(totalCost: number, walletsTotal: number): string {
  const rate = levyRate(totalCost, walletsTotal)
  if (rate >= 1) return "more than the room holds, before earnings"
  return `≈ ${formatShare(rate)} of wallets over the trip, before earnings`
}

/** ETA range at base speed from park times (`parkPlan`); incident delays aren't forecast. */
export function projectTrip(map: TripMap, departAt: number): TripProjection {
  const plan = parkPlan(map)
  const drive = map.route.driveMinutes
  const deadline = map.route.deadlineAt ? Date.parse(map.route.deadlineAt) : NaN
  return {
    routeMiles: routeMiles(map.route),
    driveMinutes: drive,
    fastestMinutes: drive + plan.mandatoryMs / 60_000,
    defaultMinutes: drive + plan.expectedMs / 60_000,
    slowestMinutes: drive + plan.maxMs / 60_000,
    deadlineMinutes: Number.isFinite(deadline) ? Math.round((deadline - departAt) / 60_000) : null,
  }
}

export function siteById(map: TripMap | null, id: string | null): TripSite | undefined {
  return id ? map?.sites.find((s) => s.id === id) : undefined
}

export function mapJson(draft: TripMapInput): string {
  return `${JSON.stringify(draft, null, 2)}\n`
}
