import {
  MIN_SITE_SPACING_MILES,
  ROUTE_END_TOLERANCE_MILES,
  fuelPlan,
  isDestination,
  parkPlan,
  resolveSiteSettings,
  routeMiles,
  sortedSites,
} from "./derive"
import { INCIDENTS, nearestMechanicAhead } from "./incidents"
import type { SiteShopOffer, TripMap } from "./schema"

export type TripMapIssueSeverity = "error" | "warning"

export type TripMapIssue = {
  severity: TripMapIssueSeverity
  code: string
  message: string
  /** JSON-ish path for editor highlighting, e.g. `sites.2.mile`. */
  path?: string
  siteId?: string
}

export type ShopValidationResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; errors: string[] }

export type LintTripMapDeps = {
  /** Validate one site's shop ids and custom offers (Item Shops `shopAccess.validateShop`). */
  validateShop?: (req: { shopIds?: string[]; offers?: SiteShopOffer[] }) => ShopValidationResult
  /** Planned departure time (ms) for the deadline check. */
  departAt?: number
  /** Asset CDN origin that published site art should live under. */
  assetBaseUrl?: string
}

export const DEFAULT_ASSET_CDN_BASE_URL = "https://cdn.listeningroom.club"

/** Key prefix Game Studio publishes site images and GLBs under (content-addressed). */
export const SITE_ASSET_KEY_PREFIX = "assets/maps/sites/"

/**
 * Trip map lint (M5). Errors block loading and departure; warnings are shown to the host and
 * designer only.
 */
export function lintTripMap(map: TripMap, deps: LintTripMapDeps = {}): TripMapIssue[] {
  const issues: TripMapIssue[] = []
  const miles = routeMiles(map.route)

  const destinations = map.sites.filter(isDestination)
  if (destinations.length === 0) {
    issues.push({
      severity: "error",
      code: "no-destination",
      message: 'The map needs one site with role "destination" at the end of the route.',
      path: "sites",
    })
  } else if (destinations.length > 1) {
    issues.push({
      severity: "error",
      code: "multiple-destinations",
      message: "Only one site can be the destination.",
      path: "sites",
    })
  }
  for (const destination of destinations) {
    if (Math.abs(destination.mile - miles) > ROUTE_END_TOLERANCE_MILES) {
      issues.push({
        severity: "error",
        code: "destination-not-at-end",
        message: `The destination is at mile ${fmt(destination.mile)} but the route is ${fmt(miles)} miles (drive minutes × base mph).`,
        path: `sites.${map.sites.indexOf(destination)}.mile`,
        siteId: destination.id,
      })
    }
  }

  const assetOrigin = `${(deps.assetBaseUrl ?? DEFAULT_ASSET_CDN_BASE_URL).replace(/\/+$/, "")}/`
  const seen = new Set<string>()
  map.sites.forEach((site, index) => {
    const assets = [
      { label: "image", url: site.imageUrl, path: `sites.${index}.imageUrl` },
      { label: "3D model", url: site.model?.url, path: `sites.${index}.model.url` },
    ]
    for (const asset of assets) {
      if (asset.url && !asset.url.startsWith(assetOrigin)) {
        issues.push({
          severity: "warning",
          code: "non-cdn-asset",
          message: `${site.name}'s ${asset.label} isn't on the asset CDN; publish it from Game Studio so it can't move or vanish.`,
          path: asset.path,
          siteId: site.id,
        })
      }
    }

    if (seen.has(site.id)) {
      issues.push({
        severity: "error",
        code: "duplicate-site-id",
        message: `Site id "${site.id}" is used more than once.`,
        path: `sites.${index}.id`,
        siteId: site.id,
      })
    }
    seen.add(site.id)

    if (site.mile > miles + ROUTE_END_TOLERANCE_MILES) {
      issues.push({
        severity: "error",
        code: "site-beyond-route",
        message: `${site.name} is at mile ${fmt(site.mile)}, past the end of the route (${fmt(miles)}).`,
        path: `sites.${index}.mile`,
        siteId: site.id,
      })
    }

    const settings = resolveSiteSettings(map, site)
    if (settings.optional) {
      const leadMiles = (map.route.baseMph * settings.pollLeadMs) / 3_600_000
      if (site.mile < leadMiles) {
        issues.push({
          severity: "warning",
          code: "poll-before-departure",
          message: `${site.name}'s skip poll would open before departure; it will use its default (${settings.skipDefault}).`,
          path: `sites.${index}.mile`,
          siteId: site.id,
        })
      }
      if (settings.pollDurationMs > settings.pollLeadMs) {
        issues.push({
          severity: "warning",
          code: "poll-longer-than-lead",
          message: `${site.name}'s skip poll lasts longer than its lead; it will close early at the exit.`,
          path: `sites.${index}.skipPoll`,
          siteId: site.id,
        })
      }
      if (
        settings.mystery &&
        site.skipPoll?.question &&
        site.skipPoll.question.toLowerCase().includes(site.name.toLowerCase())
      ) {
        issues.push({
          severity: "warning",
          code: "mystery-names-site",
          message: `${site.name} is a mystery poll but its question names the site.`,
          path: `sites.${index}.skipPoll.question`,
          siteId: site.id,
        })
      }
    } else if (site.skipPoll && !isDestination(site)) {
      issues.push({
        severity: "warning",
        code: "skip-poll-on-mandatory",
        message: `${site.name} is mandatory, so its skip-poll settings are ignored.`,
        path: `sites.${index}.skipPoll`,
        siteId: site.id,
      })
    }

    const shopIds = site.shop?.shopIds ?? []
    const offers = site.shop?.offers ?? []
    if ((shopIds.length > 0 || offers.length > 0) && deps.validateShop) {
      const result = deps.validateShop({
        ...(shopIds.length > 0 ? { shopIds } : {}),
        ...(offers.length > 0 ? { offers } : {}),
      })
      if (!result.ok) {
        for (const error of result.errors) {
          const item = error.startsWith("Unknown item")
          issues.push({
            severity: "error",
            code: item ? "unknown-item" : "unknown-shop",
            message: `${site.name}: ${error}`,
            path: `sites.${index}.shop.${item ? "offers" : "shopIds"}`,
            siteId: site.id,
          })
        }
      } else {
        for (const warning of result.warnings ?? []) {
          issues.push({
            severity: "warning",
            code: "shop-availability",
            message: `${site.name}: ${warning}`,
            path: `sites.${index}.shop.shopIds`,
            siteId: site.id,
          })
        }
      }
    }
    if (isDestination(site) && site.services?.gas) {
      issues.push({
        severity: "warning",
        code: "gas-at-destination",
        message: `${site.name} is the destination, so its gas service is ignored.`,
        path: `sites.${index}.services.gas`,
        siteId: site.id,
      })
    }
    if (site.shop && shopIds.length === 0 && offers.length === 0) {
      issues.push({
        severity: "warning",
        code: "empty-shop",
        message: `${site.name} has a shop with no shops or offers; no shop will open there.`,
        path: `sites.${index}.shop`,
        siteId: site.id,
      })
    }
    if (isDestination(site) && site.services?.mechanic) {
      issues.push({
        severity: "warning",
        code: "mechanic-at-destination",
        message: `${site.name} is the destination, so Engine Failure never tows there.`,
        path: `sites.${index}.services.mechanic`,
        siteId: site.id,
      })
    }
  })

  const destinationMile = destinations[0]?.mile ?? miles
  const eventIds = new Set<string>()
  ;(map.scriptedEvents ?? []).forEach((event, index) => {
    const path = `scriptedEvents.${index}`
    const label = INCIDENTS[event.incident].name
    if (eventIds.has(event.id)) {
      issues.push({
        severity: "error",
        code: "duplicate-event-id",
        message: `Scripted event id "${event.id}" is used more than once.`,
        path: `${path}.id`,
      })
    }
    eventIds.add(event.id)
    if (event.atMile >= destinationMile) {
      issues.push({
        severity: "error",
        code: "event-beyond-route",
        message: `${label} at mile ${fmt(event.atMile)} is at or past the destination, so it never fires.`,
        path: `${path}.atMile`,
      })
      return
    }
    if (event.incident === "engine-failure" && !nearestMechanicAhead(map, event.atMile)) {
      issues.push({
        severity: "warning",
        code: "no-mechanic",
        message: `${label} at mile ${fmt(event.atMile)} has no Mechanic ahead; a mobile mechanic repairs it on the shoulder.`,
        path: `${path}.atMile`,
      })
    }
  })

  const ordered = sortedSites(map)
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!
    const site = ordered[i]!
    // Tolerance so authored miles like 4 and 4.1 aren't rejected by float error.
    if (site.mile - prev.mile < MIN_SITE_SPACING_MILES - 1e-9) {
      issues.push({
        severity: "error",
        code: "sites-overlap",
        message: `${prev.name} and ${site.name} are less than ${MIN_SITE_SPACING_MILES} mi apart. Space sites out so the van reaches them one at a time.`,
        path: `sites.${map.sites.indexOf(site)}.mile`,
        siteId: site.id,
      })
    }
  }

  const optionalSites = sortedSites(map).filter((s) => resolveSiteSettings(map, s).optional)
  for (let i = 1; i < optionalSites.length; i++) {
    const prev = optionalSites[i - 1]!
    const site = optionalSites[i]!
    const leadMiles = (map.route.baseMph * resolveSiteSettings(map, site).pollLeadMs) / 3_600_000
    if (site.mile - prev.mile < leadMiles) {
      issues.push({
        severity: "warning",
        code: "exits-too-close",
        message: `${prev.name} and ${site.name} are closer than the skip-poll lead; their polls may overlap and one may fall back to its default.`,
        path: `sites.${map.sites.indexOf(site)}.mile`,
        siteId: site.id,
      })
    }
  }

  const fuel = fuelPlan(map)
  if (fuel.emptyAtMile !== null) {
    issues.push({
      severity: "warning",
      code: "gas-desert",
      message: `The tank runs dry around mile ${fmt(fuel.emptyAtMile)} with no gas stop the van takes if nobody votes. Add a gas site before then, or lower tanks per trip.`,
      path: "route.tanksPerTrip",
    })
  }

  if (map.route.deadlineAt) {
    const deadline = Date.parse(map.route.deadlineAt)
    if (deps.departAt !== undefined) {
      const earliest =
        deps.departAt + map.route.driveMinutes * 60_000 + parkPlan(map).mandatoryMs
      if (earliest > deadline) {
        issues.push({
          severity: "warning",
          code: "deadline-unreachable",
          message:
            "The destination can't be reached before the deadline even without optional stops.",
          path: "route.deadlineAt",
        })
      }
    }
  }

  return issues
}

export function hasLintErrors(issues: TripMapIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error")
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
