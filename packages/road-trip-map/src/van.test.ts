import { describe, expect, it } from "vitest"
import { parseTripMap } from "./parseTripMap"
import { SAMPLE_TRIP_MAP } from "./sampleMap"
import {
  deliveryBaseCost,
  formatShare,
  incidentCostEstimate,
  incidentSteps,
  levyRate,
  nearestMechanicAhead,
} from "./incidents"
import { compileVan, itemsResolving, productOf, VAN_ITEM_IDS } from "./van"

const parsed = parseTripMap(SAMPLE_TRIP_MAP)
if (!parsed.ok) throw new Error("sample map must parse")
const map = parsed.map

describe("compileVan", () => {
  it("compiles parts to speed and mpg factors, immunities, and mitigations", () => {
    const van = compileVan([VAN_ITEM_IDS.spoiler, VAN_ITEM_IDS.turbo, VAN_ITEM_IDS.tires])
    expect(productOf(van.speedFactors)).toBeCloseTo(1.05 * 1.25 * 1.04, 9)
    expect(van.mpgFactors).toEqual([{ source: "turbocharger", label: "Turbocharger", factor: 0.75 }])
    expect(van.immunities).toEqual(["blown-tire"])
    expect(van.jam).toBeNull()
    expect(van.waivesNextFee).toBe(false)
    expect(compileVan([VAN_ITEM_IDS.horn, VAN_ITEM_IDS.aaa])).toMatchObject({
      jam: { factor: 0.55, durationScale: 0.75 },
      waivesNextFee: true,
    })
  })

  it("ignores unknown ids", () => {
    expect(compileVan(["jetpack"]).speedFactors).toEqual([])
  })

  it("maps consumables to the incident they end", () => {
    expect(itemsResolving("blown-tire")).toEqual(["fix-a-flat"])
    expect(itemsResolving("traffic-jam")).toEqual(["cb-radio"])
    expect(itemsResolving("engine-failure")).toEqual([])
  })
})

describe("incidentSteps", () => {
  it("Traffic Jam is one slow step, softened by the Horn", () => {
    expect(incidentSteps(map, "traffic-jam", { mile: 1, parts: [] })).toEqual([
      { kind: "slow", label: "Stuck in traffic", factor: 0.4, ms: 8 * 60_000 },
    ])
    expect(incidentSteps(map, "traffic-jam", { mile: 1, parts: ["obnoxious-horn"] })[0]).toMatchObject({
      factor: 0.55,
      ms: 6 * 60_000,
    })
  })

  it("Blown Tire: window, roadside fund, wait; Road-Grip Tires make the van immune", () => {
    expect(incidentSteps(map, "blown-tire", { mile: 1, parts: [] }).map((s) => s.kind)).toEqual([
      "window",
      "fund",
      "wait",
    ])
    expect(incidentSteps(map, "blown-tire", { mile: 1, parts: ["road-grip-tires"] })).toEqual([])
  })

  it("Engine Failure tows to the nearest Mechanic ahead, else a mobile mechanic", () => {
    expect(nearestMechanicAhead(map, 9)?.id).toBe("hanks-garage")
    const towed = incidentSteps(map, "engine-failure", { mile: 9, parts: [] })
    expect(towed.map((s) => s.kind)).toEqual(["fund", "wait", "tow", "fund", "wait"])
    expect(towed[2]).toMatchObject({ kind: "tow", siteId: "hanks-garage" })
    const shoulder = incidentSteps(map, "engine-failure", { mile: 10.5, parts: [] })
    expect(shoulder).toEqual([
      expect.objectContaining({ kind: "fund", purpose: "repair", provider: "a mobile mechanic" }),
      expect.objectContaining({ kind: "wait" }),
    ])
  })

  it("Out of Gas delivers a full tank plus a fee", () => {
    expect(deliveryBaseCost(map)).toBe(30 + 150)
    expect(incidentSteps(map, "out-of-gas", { mile: 7, parts: [] })[0]).toMatchObject({
      kind: "fund",
      purpose: "delivery",
      baseCost: 180,
    })
  })
})

describe("incidentCostEstimate", () => {
  it("lists each fund step scaled by costScale", () => {
    expect(incidentCostEstimate(map, "engine-failure", 9, 1.5)).toEqual([
      { purpose: "tow", provider: "the tow truck", cost: 90, waivable: true },
      { purpose: "repair", provider: "Hank's Garage", cost: 150, waivable: false },
    ])
    expect(incidentCostEstimate(map, "traffic-jam", 1)).toEqual([])
  })
})

describe("levy previews", () => {
  it("levyRate is the same share of every wallet, capped at everything", () => {
    expect(levyRate(120, 6_000)).toBeCloseTo(0.02, 9)
    expect(levyRate(9_000, 6_000)).toBe(1)
    expect(levyRate(0, 6_000)).toBe(0)
    expect(levyRate(50, 0)).toBe(1)
  })

  it("formatShare reads like the levy notice", () => {
    expect(formatShare(0.012)).toBe("1.2%")
    expect(formatShare(0.0001)).toBe("0.1%")
    expect(formatShare(0.256)).toBe("26%")
  })
})
