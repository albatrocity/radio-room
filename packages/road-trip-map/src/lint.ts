import {
  MIN_SITE_SPACING_MILES,
  ROUTE_END_TOLERANCE_MILES,
  isDestination,
  parkPlan,
  resolveSiteSettings,
  routeMiles,
  sortedSites,
} from "./derive"
import type { TripMap } from "./schema"

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
  /** Validate one site's catalog shop ids (Item Shops `shopAccess.validateShop`). */
  validateShop?: (req: { shopIds: string[] }) => ShopValidationResult
  /** Planned departure time (ms) for the deadline check. */
  departAt?: number
}

/**
 * Phase 1 lint (M5). Errors block loading and departure; warnings are shown to
 * the host and designer only.
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

  const seen = new Set<string>()
  map.sites.forEach((site, index) => {
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
    if (shopIds.length > 0 && deps.validateShop) {
      const result = deps.validateShop({ shopIds })
      if (!result.ok) {
        for (const error of result.errors) {
          issues.push({
            severity: "error",
            code: "unknown-shop",
            message: `${site.name}: ${error}`,
            path: `sites.${index}.shop.shopIds`,
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
    if (site.shop && shopIds.length === 0) {
      issues.push({
        severity: "warning",
        code: "empty-shop",
        message: `${site.name} has a shop with no shopIds; no shop will open there.`,
        path: `sites.${index}.shop`,
        siteId: site.id,
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
