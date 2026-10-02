import { isDestination, sortedSites } from "./derive"
import type { IncidentId, TripMap, TripSite } from "./schema"
import { compileVan, itemsResolving } from "./van"

/**
 * Incidents (M4): a short declarative step list per incident, run one step at
 * a time by the trip engine. Every step ends on its own (D22); items make an
 * incident shorter or cheaper. Pure, so Game Studio estimates costs from it.
 */

export type IncidentFundPurpose = "roadside" | "tow" | "repair" | "delivery"

export type IncidentStep =
  /** Not a blocker: the van crawls under a speed factor (Traffic Jam). */
  | { kind: "slow"; label: string; factor: number; ms: number }
  /** The van waits; using one of `resolvesWith` (item short ids) ends the incident. */
  | { kind: "window"; label: string; ms: number; resolvesWith: string[] }
  /** A cost step (D15). `waivable`: a AAA Card covers it. */
  | { kind: "fund"; purpose: IncidentFundPurpose; baseCost: number; provider: string; waivable: boolean }
  | { kind: "wait"; label: string; ms: number }
  /** Tow the van to a Mechanic: engine off, no fuel burns. The Mechanic's shop opens on arrival. */
  | { kind: "tow"; label: string; siteId: string }

export type IncidentSpec = {
  name: string
  emoji: string
  /** Room sign headline when it starts. */
  headline: string
  body: string
}

export const INCIDENTS: Record<IncidentId, IncidentSpec> = {
  "traffic-jam": {
    name: "Traffic jam",
    emoji: "🚗",
    headline: "Traffic jam",
    body: "Brake lights for miles. The van crawls along.",
  },
  "blown-tire": {
    name: "Blown tire",
    emoji: "🛞",
    headline: "Blown tire",
    body: "BANG. The van limps onto the shoulder.",
  },
  "engine-failure": {
    name: "Engine failure",
    emoji: "🔧",
    headline: "Engine failure",
    body: "Smoke from under the hood. The van coasts to a stop.",
  },
  "out-of-gas": {
    name: "Out of gas",
    emoji: "⛽",
    headline: "Out of gas",
    body: "The engine sputters and dies. Time to call for fuel.",
  },
}

export const INCIDENT_TIMING = {
  jamFactor: 0.4,
  jamMs: 8 * 60_000,
  flatWindowMs: 60_000,
  roadsideWaitMs: 90_000,
  towTruckWaitMs: 60_000,
  repairMs: 2 * 60_000,
  deliveryWaitMs: 2 * 60_000,
  /** Tow speed as a share of the route's base speed. */
  towSpeedShare: 0.75,
} as const

/** Unscaled costs; each fund step charges `base × costScale` (D15). */
export const INCIDENT_COSTS = {
  roadside: 40,
  tow: 60,
  repair: 100,
  deliveryFee: 30,
  deliveryPricePerGallon: 10,
} as const

/** Nearest Mechanic past `mile` (never the destination). */
export function nearestMechanicAhead(map: TripMap, mile: number): TripSite | undefined {
  return sortedSites(map).find(
    (site) => site.mile > mile && site.services?.mechanic === true && !isDestination(site),
  )
}

/** Fuel delivery: a full tank at the delivery price plus the fee. */
export function deliveryBaseCost(map: TripMap): number {
  return (
    INCIDENT_COSTS.deliveryFee +
    Math.ceil(map.tuning.tankGallons * INCIDENT_COSTS.deliveryPricePerGallon)
  )
}

export type IncidentStepContext = {
  /** Van mile when the incident starts (picks the Mechanic ahead). */
  mile: number
  /** Installed part short ids. */
  parts: readonly string[]
}

/** The concrete steps for `incident` here and now; empty when a part makes the van immune. */
export function incidentSteps(
  map: TripMap,
  incident: IncidentId,
  { mile, parts }: IncidentStepContext,
): IncidentStep[] {
  const van = compileVan(parts)
  if (van.immunities.includes(incident)) return []
  const t = INCIDENT_TIMING
  switch (incident) {
    case "traffic-jam": {
      const jam = van.jam ?? { factor: t.jamFactor, durationScale: 1 }
      return [
        {
          kind: "slow",
          label: "Stuck in traffic",
          factor: jam.factor,
          ms: Math.round(t.jamMs * jam.durationScale),
        },
      ]
    }
    case "blown-tire":
      return [
        {
          kind: "window",
          label: "Waiting on the shoulder",
          ms: t.flatWindowMs,
          resolvesWith: itemsResolving("blown-tire"),
        },
        {
          kind: "fund",
          purpose: "roadside",
          baseCost: INCIDENT_COSTS.roadside,
          provider: "roadside service",
          waivable: true,
        },
        { kind: "wait", label: "Changing the tire", ms: t.roadsideWaitMs },
      ]
    case "engine-failure": {
      const mechanic = nearestMechanicAhead(map, mile)
      if (!mechanic) {
        return [
          {
            kind: "fund",
            purpose: "repair",
            baseCost: INCIDENT_COSTS.repair,
            provider: "a mobile mechanic",
            waivable: false,
          },
          { kind: "wait", label: "Repairs on the shoulder", ms: t.repairMs },
        ]
      }
      return [
        {
          kind: "fund",
          purpose: "tow",
          baseCost: INCIDENT_COSTS.tow,
          provider: "the tow truck",
          waivable: true,
        },
        { kind: "wait", label: "Waiting for the tow truck", ms: t.towTruckWaitMs },
        { kind: "tow", label: `Towing to ${mechanic.name}`, siteId: mechanic.id },
        {
          kind: "fund",
          purpose: "repair",
          baseCost: INCIDENT_COSTS.repair,
          provider: mechanic.name,
          waivable: false,
        },
        { kind: "wait", label: `Repairs at ${mechanic.name}`, ms: t.repairMs },
      ]
    }
    case "out-of-gas":
      return [
        {
          kind: "fund",
          purpose: "delivery",
          baseCost: deliveryBaseCost(map),
          provider: "the fuel truck",
          waivable: false,
        },
        { kind: "wait", label: "Waiting for the fuel truck", ms: t.deliveryWaitMs },
      ]
  }
}

export type IncidentCostLine = {
  purpose: IncidentFundPurpose
  provider: string
  cost: number
  /** The AAA Card covers it. */
  waivable: boolean
}

/** Fund steps an incident would charge at `mile` with no parts, scaled by `costScale`. */
export function incidentCostEstimate(
  map: TripMap,
  incident: IncidentId,
  mile: number,
  costScale = 1,
): IncidentCostLine[] {
  return incidentSteps(map, incident, { mile, parts: [] }).flatMap((step) =>
    step.kind === "fund"
      ? [
          {
            purpose: step.purpose,
            provider: step.provider,
            cost: Math.round(step.baseCost * costScale),
            waivable: step.waivable,
          },
        ]
      : [],
  )
}

/** Fund copy per purpose: "Roadside service", "Tow", … */
export const FUND_PURPOSE_LABELS: Record<IncidentFundPurpose | "gas", string> = {
  gas: "Gas",
  roadside: "Roadside service",
  tow: "Tow",
  repair: "Repairs",
  delivery: "Fuel delivery",
}

/** A levy rate as the share of each wallet ("1.2%"), as players see it in levy notices (D16). */
export function formatShare(rate: number): string {
  const percent = rate * 100
  if (percent >= 10) return `${Math.round(percent)}%`
  return `${Math.max(0.1, Math.round(percent * 10) / 10)}%`
}

/**
 * Share of every wallet an automatic levy of `cost` takes from a room holding
 * `walletsTotal` coins in all (D16: everyone pays the same percentage). 1 = the
 * room can't cover it and pays everything. 0 when nothing is charged.
 */
export function levyRate(cost: number, walletsTotal: number): number {
  if (cost <= 0) return 0
  if (walletsTotal <= 0) return 1
  return Math.min(1, cost / walletsTotal)
}
