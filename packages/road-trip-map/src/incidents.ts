import { isDestination, sortedSites } from "./derive"
import type {
  EventResolution,
  IncidentId,
  TripEvent,
  TripMap,
  TripSite,
} from "./schema"
import { compileVan, itemsResolving } from "./van"

/**
 * Trip events (ADR 0220): authored data compiled to a short step list, run one
 * step at a time by the trip engine. Every step ends on its own (D22); items
 * make an incident shorter or cheaper. Pure, so Game Studio estimates costs
 * from it.
 */

export type IncidentFundPurpose = "roadside" | "tow" | "repair" | "delivery"

export type IncidentStep =
  /** Not a blocker: the van crawls under a speed factor; `resolvesWith` items end it early. */
  | { kind: "slow"; label: string; factor: number; ms: number; resolvesWith?: string[] }
  /** The van waits; using one of `resolvesWith` (item short ids) ends the incident. */
  | { kind: "window"; label: string; ms: number; resolvesWith: string[] }
  /** A cost step (D15). `waivable`: a AAA Card covers it. */
  | {
      kind: "fund"
      purpose: IncidentFundPurpose
      baseCost: number
      provider: string
      waivable: boolean
    }
  /**
   * `status` replaces the incident's name as the headline once help is on the
   * way ("Refuelling"). `refills`: the gauge climbs across it and the tank fills
   * when the incident clears.
   */
  | { kind: "wait"; label: string; ms: number; status?: string; refills?: true }
  /** Tow the van to a Mechanic: engine off, no fuel burns. The Mechanic's shop opens on arrival. */
  | { kind: "tow"; label: string; siteId: string }

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

/** An event preset: everything but the id and mile, which the designer sets. */
export type TripEventPresetBody = Omit<TripEvent, "id" | "mile" | "presetId">

/** The built-in incidents. Hosts trigger the first three; Out of Gas follows an empty tank. */
export const INCIDENT_PRESETS: Record<IncidentId, TripEventPresetBody> = {
  "traffic-jam": {
    name: "Traffic jam",
    icon: "🚗",
    narrative: "Hit some traffic. The van crawls along.",
    clearedNarrative: "Traffic clears. Back to cruising speed.",
    family: "jam",
    effect: { kind: "slow", factor: INCIDENT_TIMING.jamFactor, label: "Stuck in traffic" },
    durationMinutes: INCIDENT_TIMING.jamMs / 60_000,
    resolution: [{ kind: "item" }],
  },
  "blown-tire": {
    name: "Blown tire",
    icon: "🛞",
    narrative: "BANG. The van limps onto the shoulder.",
    family: "flat",
    effect: { kind: "stop" },
    resolution: [
      { kind: "item", windowMinutes: INCIDENT_TIMING.flatWindowMs / 60_000 },
      { kind: "fund", purpose: "roadside" },
      { kind: "wait", minutes: INCIDENT_TIMING.roadsideWaitMs / 60_000, label: "Changing the tire" },
    ],
  },
  "engine-failure": {
    name: "Engine failure",
    icon: "🔧",
    narrative: "Smoke from under the hood. The van coasts to a stop.",
    family: "engine",
    effect: { kind: "stop" },
    resolution: [{ kind: "tow" }],
  },
  "out-of-gas": {
    name: "Out of gas",
    icon: "⛽",
    narrative: "The engine sputters and dies. Time to call for fuel.",
    clearedNarrative: "Fuel's in. Full tank.",
    trigger: "fuel",
    family: "none",
    effect: { kind: "stop" },
    resolution: [{ kind: "refuel" }],
  },
}

export const INCIDENT_PRESET_IDS = Object.keys(INCIDENT_PRESETS) as IncidentId[]

export function isIncidentPresetId(id: string): id is IncidentId {
  return id in INCIDENT_PRESETS
}

/** Instantiate a preset with a unique id; `mile` events also get a mile. */
export function eventFromPreset(presetId: IncidentId, id: string, mile?: number): TripEvent {
  const event: TripEvent = { ...structuredClone(INCIDENT_PRESETS[presetId]), id, presetId }
  if (mile !== undefined && (event.trigger ?? "mile") === "mile") event.mile = mile
  return event
}

/** A built-in incident as an event (host triggers, the default Out of Gas). */
export function builtInEvent(presetId: IncidentId): TripEvent {
  return eventFromPreset(presetId, presetId)
}

export function eventTrigger(event: Pick<TripEvent, "trigger">): "mile" | "fuel" {
  return event.trigger ?? "mile"
}

/** Map events that fire at a mile, in authored order. */
export function mileEvents(map: Pick<TripMap, "events">): (TripEvent & { mile: number })[] {
  return (map.events ?? []).filter(
    (event): event is TripEvent & { mile: number } =>
      eventTrigger(event) === "mile" && event.mile !== undefined,
  )
}

/** What an empty tank starts: the map's `fuel` event, else the built-in Out of Gas. */
export function fuelEvent(map: Pick<TripMap, "events">): TripEvent {
  return (map.events ?? []).find((e) => eventTrigger(e) === "fuel") ?? builtInEvent("out-of-gas")
}

/** Whether running `event` fills the tank (it has a `refuel` resolution). */
export function eventRefuels(event: Pick<TripEvent, "resolution">): boolean {
  return (event.resolution ?? []).some((entry) => entry.kind === "refuel")
}

/** Nearest Mechanic past `mile` (never the destination). */
export function nearestMechanicAhead(map: TripMap, mile: number): TripSite | undefined {
  return sortedSites(map).find(
    (site) => site.mile > mile && site.services?.mechanic === true && !isDestination(site),
  )
}

/** Fuel delivery: a full tank at the delivery price plus the fee. */
export function deliveryBaseCost(
  map: TripMap,
  fee: number = INCIDENT_COSTS.deliveryFee,
  pricePerGallon: number = INCIDENT_COSTS.deliveryPricePerGallon,
): number {
  return fee + Math.ceil(map.tuning.tankGallons * pricePerGallon)
}

export type IncidentStepContext = {
  /** Van mile when the incident starts (picks the Mechanic ahead). */
  mile: number
  /** Installed part short ids. */
  parts: readonly string[]
}

const FUND_DEFAULTS: Record<IncidentFundPurpose, { provider: string; waivable: boolean }> = {
  roadside: { provider: "roadside service", waivable: true },
  tow: { provider: "the tow truck", waivable: true },
  repair: { provider: "a mobile mechanic", waivable: false },
  delivery: { provider: "the fuel truck", waivable: false },
}

function minutesMs(minutes: number): number {
  return Math.round(minutes * 60_000)
}

function fundBaseCost(map: TripMap, purpose: IncidentFundPurpose): number {
  if (purpose === "delivery") return deliveryBaseCost(map)
  return INCIDENT_COSTS[purpose]
}

function resolutionSteps(
  map: TripMap,
  entry: EventResolution,
  { mile }: IncidentStepContext,
): IncidentStep[] {
  const t = INCIDENT_TIMING
  switch (entry.kind) {
    case "item":
      return []
    case "fund":
      return [
        {
          kind: "fund",
          purpose: entry.purpose,
          baseCost: entry.baseCost ?? fundBaseCost(map, entry.purpose),
          provider: entry.provider ?? FUND_DEFAULTS[entry.purpose].provider,
          waivable: entry.waivable ?? FUND_DEFAULTS[entry.purpose].waivable,
        },
      ]
    case "wait":
      return [
        {
          kind: "wait",
          label: entry.label ?? "Waiting",
          ms: minutesMs(entry.minutes),
          ...(entry.status ? { status: entry.status } : {}),
        },
      ]
    case "tow": {
      const repairCost = entry.repairCost ?? INCIDENT_COSTS.repair
      const repairMs = entry.repairMinutes !== undefined ? minutesMs(entry.repairMinutes) : t.repairMs
      const mechanic = nearestMechanicAhead(map, mile)
      if (!mechanic) {
        return [
          {
            kind: "fund",
            purpose: "repair",
            baseCost: repairCost,
            provider: FUND_DEFAULTS.repair.provider,
            waivable: false,
          },
          { kind: "wait", label: "Repairs on the shoulder", ms: repairMs },
        ]
      }
      return [
        {
          kind: "fund",
          purpose: "tow",
          baseCost: entry.towCost ?? INCIDENT_COSTS.tow,
          provider: FUND_DEFAULTS.tow.provider,
          waivable: true,
        },
        {
          kind: "wait",
          label: "Waiting for the tow truck",
          ms: entry.towWaitMinutes !== undefined ? minutesMs(entry.towWaitMinutes) : t.towTruckWaitMs,
        },
        { kind: "tow", label: `Towing to ${mechanic.name}`, siteId: mechanic.id },
        {
          kind: "fund",
          purpose: "repair",
          baseCost: repairCost,
          provider: mechanic.name,
          waivable: false,
        },
        { kind: "wait", label: `Repairs at ${mechanic.name}`, ms: repairMs },
      ]
    }
    case "refuel":
      return [
        {
          kind: "fund",
          purpose: "delivery",
          baseCost: deliveryBaseCost(map, entry.fee, entry.pricePerGallon),
          provider: FUND_DEFAULTS.delivery.provider,
          waivable: false,
        },
        {
          kind: "wait",
          label: "Waiting for the fuel truck",
          ms: entry.waitMinutes !== undefined ? minutesMs(entry.waitMinutes) : t.deliveryWaitMs,
          status: entry.status ?? "Refuelling",
          refills: true,
        },
      ]
  }
}

/**
 * The concrete steps for `event` here and now. Empty when the event has no
 * effect (it only narrates) or a part makes the van immune to its family.
 */
export function compileEventSteps(
  map: TripMap,
  event: TripEvent,
  ctx: IncidentStepContext,
): IncidentStep[] {
  const effect = event.effect
  if (!effect) return []
  const family = event.family ?? "none"
  const van = compileVan(ctx.parts)
  if (van.immunities.includes(family)) return []
  const chain = event.resolution ?? []
  const itemsOf = (entry: Extract<EventResolution, { kind: "item" }>) =>
    entry.items ?? itemsResolving(family)
  const steps: IncidentStep[] = []
  if (effect.kind === "slow") {
    const jam = family === "jam" ? van.jam : null
    const resolvesWith = Array.from(
      new Set(chain.flatMap((entry) => (entry.kind === "item" ? itemsOf(entry) : []))),
    )
    steps.push({
      kind: "slow",
      label: effect.label ?? "Slowed down",
      factor: jam ? Math.max(effect.factor, jam.factor) : effect.factor,
      ms: Math.round(minutesMs(event.durationMinutes ?? 0) * (jam?.durationScale ?? 1)),
      ...(resolvesWith.length > 0 ? { resolvesWith } : {}),
    })
  }
  for (const entry of chain) {
    if (entry.kind === "item") {
      if (effect.kind !== "stop") continue
      steps.push({
        kind: "window",
        label: entry.label ?? "Waiting on the shoulder",
        ms: minutesMs(entry.windowMinutes ?? INCIDENT_TIMING.flatWindowMs / 60_000),
        resolvesWith: itemsOf(entry),
      })
      continue
    }
    steps.push(...resolutionSteps(map, entry, ctx))
  }
  return steps
}

/** The concrete steps for a built-in incident here and now; empty when a part makes the van immune. */
export function incidentSteps(
  map: TripMap,
  incident: IncidentId,
  ctx: IncidentStepContext,
): IncidentStep[] {
  return compileEventSteps(map, builtInEvent(incident), ctx)
}

export type IncidentCostLine = {
  purpose: IncidentFundPurpose
  provider: string
  cost: number
  /** The AAA Card covers it. */
  waivable: boolean
}

/** Fund steps `event` would charge at `mile` with no parts, scaled by `costScale`. */
export function eventCostEstimate(
  map: TripMap,
  event: TripEvent,
  mile: number,
  costScale = 1,
): IncidentCostLine[] {
  return compileEventSteps(map, event, { mile, parts: [] }).flatMap((step) =>
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

/** Fund steps a built-in incident would charge at `mile` with no parts, scaled by `costScale`. */
export function incidentCostEstimate(
  map: TripMap,
  incident: IncidentId,
  mile: number,
  costScale = 1,
): IncidentCostLine[] {
  return eventCostEstimate(map, builtInEvent(incident), mile, costScale)
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

/**
 * Trip maps written before ADR 0220 list `scriptedEvents: { id, atMile, incident }`.
 * Trips haven't shipped, so lift them into `events` rather than migrate.
 * Unknown incidents lift to an event with no name, which the schema rejects.
 */
export function liftLegacyTripMap<T>(raw: T): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
  const record = raw as Record<string, unknown>
  if (!("scriptedEvents" in record)) return raw
  const { scriptedEvents, ...rest } = record
  if (!Array.isArray(scriptedEvents) || rest.events !== undefined) return rest as T
  const lifted = scriptedEvents.map((legacy: unknown) => {
    const { id, atMile, incident } = (legacy ?? {}) as Record<string, unknown>
    if (typeof incident === "string" && isIncidentPresetId(incident) && typeof id === "string") {
      const event = eventFromPreset(incident, id)
      return { ...event, mile: atMile }
    }
    return { id, mile: atMile }
  })
  return { ...rest, events: lifted } as T
}
