import {
  GENERIC_SITE_PRESETS,
  SAMPLE_TRIP_MAP,
  isDestination,
  parkPlan,
  parseTripMap,
  routeMiles,
  siteFromPreset,
  sitePresetForShop,
  tripMapSchema,
  type ParseTripMapResult,
  type SitePreset,
  type TripMap,
  type TripMapInput,
  type TripSite,
} from "@repo/road-trip-map"
import { RECORD_STORE_SHOP, SHOP_CATALOG, validateRoomShopIds } from "@repo/plugin-item-shops"

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

/** Item Shops' own check, with only Record Store treated as room-dependent. */
export function validateCatalogShop(req: { shopIds: string[] }) {
  return validateRoomShopIds(req.shopIds, KNOWN_SHOP_IDS, EVERYWHERE_SHOP_IDS)
}

export function parseDraft(draft: TripMapInput, departAt: number): ParseTripMapResult {
  return parseTripMap(draft, { validateShop: validateCatalogShop, departAt })
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

/** ETA range at base speed from park times (`parkPlan`); no incidents or fuel in Phase 1. */
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
