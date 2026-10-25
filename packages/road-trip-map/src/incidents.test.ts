import { describe, expect, it } from "vitest"
import {
  INCIDENT_COSTS,
  INCIDENT_PRESET_IDS,
  INCIDENT_TIMING,
  builtInEvent,
  compileEventSteps,
  deliveryBaseCost,
  eventCostEstimate,
  eventFromPreset,
  fuelEvent,
  nearestMechanicAhead,
  type IncidentStep,
  type IncidentStepContext,
} from "./incidents"
import { parseTripMap } from "./parseTripMap"
import { SAMPLE_TRIP_MAP } from "./sampleMap"
import type { IncidentId, TripMap } from "./schema"
import { compileVan, itemsResolving, VAN_ITEM_IDS } from "./van"

const parsed = parseTripMap(SAMPLE_TRIP_MAP)
if (!parsed.ok) throw new Error("sample map must parse")
const map = parsed.map

/**
 * The step lists the closed incident switch produced before ADR 0220, kept as
 * the golden reference for the presets. Two intentional additions: slow steps
 * name the items that end them (formerly implied by the incident id), and the
 * fuel truck's wait is marked `refills`.
 */
function legacyIncidentSteps(
  m: TripMap,
  incident: IncidentId,
  { mile, parts }: IncidentStepContext,
): IncidentStep[] {
  const van = compileVan(parts)
  if (incident === "blown-tire" && van.immunities.includes("flat")) return []
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
          resolvesWith: ["cb-radio"],
        },
      ]
    }
    case "blown-tire":
      return [
        {
          kind: "window",
          label: "Waiting on the shoulder",
          ms: t.flatWindowMs,
          resolvesWith: ["fix-a-flat"],
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
      const mechanic = nearestMechanicAhead(m, mile)
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
          baseCost: deliveryBaseCost(m),
          provider: "the fuel truck",
          waivable: false,
        },
        {
          kind: "wait",
          label: "Waiting for the fuel truck",
          ms: t.deliveryWaitMs,
          status: "Refuelling",
          refills: true,
        },
      ]
  }
}

const PART_SETS: string[][] = [
  [],
  [VAN_ITEM_IDS.horn],
  [VAN_ITEM_IDS.tires],
  [VAN_ITEM_IDS.aaa],
  [
    VAN_ITEM_IDS.spoiler,
    VAN_ITEM_IDS.turbo,
    VAN_ITEM_IDS.tires,
    VAN_ITEM_IDS.horn,
    VAN_ITEM_IDS.aaa,
  ],
]

describe("incident presets", () => {
  it("compile to the same steps as the closed incident switch", () => {
    // Mile 9 has Hank's Garage ahead; 10.5 is past it.
    expect(nearestMechanicAhead(map, 9)).toBeDefined()
    expect(nearestMechanicAhead(map, 10.5)).toBeUndefined()
    for (const incident of INCIDENT_PRESET_IDS) {
      for (const mile of [0.5, 4, 9, 10.5, 11.9]) {
        for (const parts of PART_SETS) {
          const ctx = { mile, parts }
          expect(
            compileEventSteps(map, builtInEvent(incident), ctx),
            `${incident} at ${mile} with [${parts.join(", ")}]`,
          ).toEqual(legacyIncidentSteps(map, incident, ctx))
        }
      }
    }
  })

  it("stamps a preset with an id and a mile; fuel events get no mile", () => {
    expect(eventFromPreset("blown-tire", "flat-2", 4)).toMatchObject({
      id: "flat-2",
      presetId: "blown-tire",
      mile: 4,
      name: "Blown tire",
    })
    expect(eventFromPreset("out-of-gas", "dry", 4).mile).toBeUndefined()
  })

  it("an empty tank starts the map's fuel event, else the built-in Out of Gas", () => {
    expect(fuelEvent(map).id).toBe("out-of-gas")
    const custom = { ...eventFromPreset("out-of-gas", "dry"), name: "Bone dry" }
    expect(fuelEvent({ events: [custom] }).name).toBe("Bone dry")
  })
})

describe("compileEventSteps (custom events)", () => {
  it("a custom jam keeps its own factor and duration, and the horn only ever helps", () => {
    const crawl = {
      ...eventFromPreset("traffic-jam", "crawl", 3),
      effect: { kind: "slow" as const, factor: 0.2, label: "Bumper to bumper" },
      durationMinutes: 4,
    }
    expect(compileEventSteps(map, crawl, { mile: 3, parts: [] })).toEqual([
      { kind: "slow", label: "Bumper to bumper", factor: 0.2, ms: 4 * 60_000, resolvesWith: ["cb-radio"] },
    ])
    const light = { ...crawl, effect: { kind: "slow" as const, factor: 0.8 } }
    expect(compileEventSteps(map, light, { mile: 3, parts: [VAN_ITEM_IDS.horn] })[0]).toMatchObject({
      factor: 0.8,
      ms: 3 * 60_000,
    })
  })

  it("family none: no part coupling unless the resolution names items", () => {
    const fog = {
      id: "fog",
      name: "Fog bank",
      icon: "🌫️",
      mile: 2,
      effect: { kind: "slow" as const, factor: 0.5 },
      durationMinutes: 2,
    }
    expect(compileEventSteps(map, fog, { mile: 2, parts: [VAN_ITEM_IDS.horn] })).toEqual([
      { kind: "slow", label: "Slowed down", factor: 0.5, ms: 2 * 60_000 },
    ])
    const radio = { ...fog, resolution: [{ kind: "item" as const, items: ["cb-radio"] }] }
    expect(compileEventSteps(map, radio, { mile: 2, parts: [] })[0]).toMatchObject({
      resolvesWith: ["cb-radio"],
    })
  })

  it("a custom flat is shrugged off by Road-Grip Tires", () => {
    const nails = { ...eventFromPreset("blown-tire", "nails", 2), name: "Roofing nails" }
    expect(compileEventSteps(map, nails, { mile: 2, parts: [VAN_ITEM_IDS.tires] })).toEqual([])
    expect(compileEventSteps(map, nails, { mile: 2, parts: [] })).toHaveLength(3)
  })

  it("narrative-only events compile to nothing", () => {
    expect(compileEventSteps(map, { id: "sign", name: "Sign", icon: "🪧", mile: 2 }, { mile: 2, parts: [] })).toEqual([])
  })

  it("tow and refuel overrides change costs and waits", () => {
    const pricey = {
      ...eventFromPreset("engine-failure", "pricey", 9),
      resolution: [{ kind: "tow" as const, towCost: 10, repairCost: 20, repairMinutes: 1 }],
    }
    expect(eventCostEstimate(map, pricey, 9)).toEqual([
      { purpose: "tow", provider: "the tow truck", cost: 10, waivable: true },
      { purpose: "repair", provider: "Hank's Garage", cost: 20, waivable: false },
    ])
    expect(compileEventSteps(map, pricey, { mile: 9, parts: [] }).at(-1)).toMatchObject({ ms: 60_000 })
    const cheapFuel = {
      ...eventFromPreset("out-of-gas", "cheap"),
      resolution: [{ kind: "refuel" as const, fee: 0, pricePerGallon: 1, waitMinutes: 1 }],
    }
    expect(compileEventSteps(map, cheapFuel, { mile: 3, parts: [] })).toEqual([
      expect.objectContaining({ kind: "fund", baseCost: 15 }),
      expect.objectContaining({ kind: "wait", ms: 60_000, refills: true }),
    ])
  })

  it("defaults fund fields by purpose", () => {
    expect(
      compileEventSteps(
        map,
        { id: "x", name: "X", icon: "x", mile: 1, effect: { kind: "stop" }, resolution: [{ kind: "fund", purpose: "roadside" }] },
        { mile: 1, parts: [] },
      ),
    ).toEqual([
      { kind: "fund", purpose: "roadside", baseCost: 40, provider: "roadside service", waivable: true },
    ])
  })

  it("family consumables are the default items", () => {
    expect(itemsResolving("flat")).toEqual(["fix-a-flat"])
    expect(itemsResolving("jam")).toEqual(["cb-radio"])
    expect(itemsResolving("engine")).toEqual([])
  })
})
