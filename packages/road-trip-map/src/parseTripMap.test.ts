import { describe, expect, it } from "vitest"
import { parseTripMap } from "./parseTripMap"
import { SAMPLE_TRIP_MAP } from "./sampleMap"
import {
  baseGallonsPerMile,
  effectiveSkipDefault,
  fuelPlan,
  gasCost,
  parkPlan,
  resolveSiteSettings,
  revealMileAtBaseSpeed,
  routeMiles,
  skipPollQuestion,
} from "./derive"
import { tripMapContentHash } from "./hash"
import { TRIP_MAP_MAX_BYTES, type TripMapInput } from "./schema"
import { GENERIC_SITE_PRESETS, siteFromPreset, sitePresetForShop } from "./presets"

function clone(): TripMapInput {
  return structuredClone(SAMPLE_TRIP_MAP)
}

function codes(result: ReturnType<typeof parseTripMap>): string[] {
  return result.issues.map((i) => i.code)
}

describe("parseTripMap", () => {
  it("accepts the sample map from a JSON string and applies defaults", () => {
    const result = parseTripMap(JSON.stringify(SAMPLE_TRIP_MAP))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(routeMiles(result.map.route)).toBe(12)
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(result.issues).toEqual([])
  })

  it("applies tuning defaults when tuning is omitted", () => {
    const input = clone()
    delete input.tuning
    const result = parseTripMap(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.map.tuning).toEqual({
      tankGallons: 15,
      lowFuelPct: 0.15,
      parkMinutes: 4,
      revealMiles: 10,
      skipPoll: { leadMinutes: 1.5, durationSec: 45, default: "skip" },
      funds: { mode: "automatic", windowMinutes: 3 },
    })
  })

  it("rejects invalid JSON and oversized input", () => {
    expect(codes(parseTripMap("{nope"))).toEqual(["invalid-json"])
    expect(codes(parseTripMap(" ".repeat(TRIP_MAP_MAX_BYTES + 1)))).toEqual(["too-large"])
  })

  it("reports schema errors with paths", () => {
    const input = clone() as Record<string, unknown>
    input.schemaVersion = 2
    const result = parseTripMap(input)
    expect(result.ok).toBe(false)
    expect(result.issues[0]?.path).toBe("schemaVersion")
  })

  it("rejects non-https image URLs", () => {
    const input = clone()
    input.sites[0]!.imageUrl = "http://example.com/a.png"
    expect(parseTripMap(input).ok).toBe(false)
  })

  it("requires exactly one destination at the end of the route", () => {
    const none = clone()
    delete none.sites[3]!.role
    expect(codes(parseTripMap(none))).toContain("no-destination")

    const two = clone()
    two.sites[1]!.role = "destination"
    expect(codes(parseTripMap(two))).toContain("multiple-destinations")

    const short = clone()
    short.sites[3]!.mile = 11
    expect(codes(parseTripMap(short))).toContain("destination-not-at-end")
  })

  it("rejects duplicate ids and sites beyond the route", () => {
    const dup = clone()
    dup.sites[1]!.id = "record-store"
    expect(codes(parseTripMap(dup))).toContain("duplicate-site-id")

    const beyond = clone()
    beyond.sites[0]!.mile = 20
    expect(codes(parseTripMap(beyond))).toContain("site-beyond-route")
  })

  it("warns when exits are closer than the skip-poll lead", () => {
    const input = clone()
    input.sites[1]!.mile = 5
    const result = parseTripMap(input)
    expect(result.ok).toBe(true)
    expect(codes(result)).toContain("exits-too-close")
  })

  it("warns when a mystery poll question names the site", () => {
    const input = clone()
    input.sites[0]!.skipPoll = { mystery: true, question: "Dusty Boots Records ahead?" }
    expect(codes(parseTripMap(input))).toContain("mystery-names-site")
  })

  it("warns when a poll would open before departure", () => {
    const input = clone()
    input.sites[0]!.mile = 1
    expect(codes(parseTripMap(input))).toContain("poll-before-departure")
  })

  it("blocks unknown shop ids through validateShop", () => {
    const result = parseTripMap(clone(), {
      validateShop: ({ shopIds }) =>
        shopIds?.includes("farmers-market")
          ? { ok: false, errors: ['Unknown shop "farmers-market"'] }
          : { ok: true },
    })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain("unknown-shop")
  })

  it("passes shop availability warnings through without blocking", () => {
    const result = parseTripMap(clone(), {
      validateShop: () => ({ ok: true, warnings: ["Record Store only opens on the bridge"] }),
    })
    expect(result.ok).toBe(true)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "shop-availability",
        message: "Farmers Market: Record Store only opens on the bridge",
        siteId: "farmers-market",
      }),
    )
  })

  it("warns about an unreachable deadline", () => {
    const input = clone()
    input.route.deadlineAt = "2026-10-02T20:05:00.000Z"
    const result = parseTripMap(input, { departAt: Date.parse("2026-10-02T20:00:00.000Z") })
    expect(codes(result)).toContain("deadline-unreachable")
  })
})

describe("derive", () => {
  const parsed = parseTripMap(SAMPLE_TRIP_MAP)
  if (!parsed.ok) throw new Error("sample map must parse")
  const map = parsed.map

  it("resolves site settings from tuning", () => {
    const settings = resolveSiteSettings(map, map.sites[0]!)
    expect(settings).toMatchObject({
      optional: true,
      mystery: false,
      revealMiles: 3,
      pollLeadMs: 90_000,
      pollDurationMs: 45_000,
      skipDefault: "skip",
      parkMs: 240_000,
    })
    expect(resolveSiteSettings(map, map.sites[3]!).optional).toBe(false)
  })

  it("defaults mystery sites to reveal on arrival and supports always", () => {
    const mystery = { ...map.sites[0]!, skipPoll: { mystery: true } }
    expect(resolveSiteSettings(map, mystery).revealMiles).toBe(0)
    const always = { ...map.sites[0]!, revealMiles: "always" as const }
    expect(resolveSiteSettings(map, always).revealMiles).toBe(Number.POSITIVE_INFINITY)
  })

  it("reveals at the earlier of distance and poll at base speed", () => {
    // revealMiles 3 → mile 1; poll lead 1.5 min at 60 mph → mile 2.5
    expect(revealMileAtBaseSpeed(map, map.sites[0]!)).toBe(1)
    const close = { ...map.sites[0]!, revealMiles: 1 }
    expect(revealMileAtBaseSpeed(map, close)).toBe(2.5)
  })

  it("builds skip-poll questions", () => {
    expect(skipPollQuestion(map.sites[2]!, 1.5, false)).toBe("Farmers Market in 2 miles: pull off?")
    expect(skipPollQuestion(map.sites[2]!, 0.4, false)).toBe("Farmers Market in 1 mile: pull off?")
    expect(skipPollQuestion(map.sites[2]!, 2, true)).toBe("Something's up ahead. Pull off?")
  })
})

describe("hash and presets", () => {
  it("hashes independently of key order", () => {
    expect(tripMapContentHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      tripMapContentHash({ b: [1, { d: 3, c: 2 }], a: 1 }),
    )
    expect(tripMapContentHash({ a: 1 })).not.toBe(tripMapContentHash({ a: 2 }))
  })

  it("instantiates presets", () => {
    const venuePreset = GENERIC_SITE_PRESETS.find((p) => p.id === "destination-venue")!
    const venue = siteFromPreset(venuePreset, "venue", 12)
    expect(venue).toMatchObject({
      id: "venue",
      mile: 12,
      role: "destination",
      presetId: "destination-venue",
    })
    const stand = sitePresetForShop({
      shopId: "farmers-market",
      name: "Farmers Market",
      icon: "🍎",
    })
    expect(stand.site.shop).toEqual({ shopIds: ["farmers-market"] })
  })
})

describe("parkPlan", () => {
  function plan(mutate?: (map: TripMapInput) => void, opts?: Parameters<typeof parkPlan>[1]) {
    const input = clone()
    mutate?.(input)
    const result = parseTripMap(input)
    if (!result.ok) throw new Error("bad map")
    return parkPlan(result.map, opts)
  }

  it("splits mandatory, expected (defaults), and every stop; never the destination", () => {
    // Sample: record store (skip default, 4 min), gas (reached low on fuel, so it
    // stops by default, 2 min), farmers market (stop default, 4 min), and
    // Hank's Garage (skip default, 4 min).
    expect(plan()).toEqual({ mandatoryMs: 0, expectedMs: 6 * 60_000, maxMs: 14 * 60_000 })
    expect(plan((m) => (m.sites[0]!.mandatory = true))).toEqual({
      mandatoryMs: 4 * 60_000,
      expectedMs: 10 * 60_000,
      maxMs: 14 * 60_000,
    })
  })

  it("honors known decisions and a mile cutoff for a live trip", () => {
    expect(
      plan(undefined, { decisionFor: (site) => (site.id === "record-store" ? "stop" : "skip") }),
    ).toEqual({ mandatoryMs: 4 * 60_000, expectedMs: 4 * 60_000, maxMs: 4 * 60_000 })
    expect(plan(undefined, { afterMile: 4 }).maxMs).toBe(10 * 60_000)
  })
})

describe("fuel", () => {
  function parsed(mutate?: (map: TripMapInput) => void) {
    const input = clone()
    mutate?.(input)
    const result = parseTripMap(input)
    const { map } = result
    if (!map) throw new Error("bad map")
    return { ...result, map }
  }

  it("derives burn from tanks per trip and plans a fill where fuel runs low", () => {
    const { map } = parsed()
    // 1.8 tanks × 15 gal over 12 mi → 2.25 gal/mi; range 6.67 mi.
    expect(baseGallonsPerMile(map)).toBeCloseTo(2.25, 6)
    const plan = fuelPlan(map)
    expect(plan.lowAtMile).toBeCloseTo((15 - 2.25) / 2.25, 6)
    expect(plan.emptyAtMile).toBeNull()
    expect(plan.gasStops).toEqual([
      {
        siteId: "gas-n-go",
        mile: 6,
        gallonsOnArrival: expect.closeTo(1.5, 6),
        stops: true,
        gallons: expect.closeTo(13.5, 6),
        baseCost: 108,
      },
    ])
    expect(plan.points.at(-1)).toEqual({ mile: 12, gallons: expect.closeTo(1.5, 6) })
  })

  it("only defaults a gas site to stop when the van reaches it low", () => {
    const { map } = parsed()
    const gas = map.sites[1]!
    expect(effectiveSkipDefault(map, gas, 1.5)).toBe("stop")
    expect(effectiveSkipDefault(map, gas, 9)).toBe("skip")
    expect(effectiveSkipDefault(map, map.sites[0]!, 0)).toBe("skip")
  })

  it("warns about a gas desert, including a gas site the van skips by default", () => {
    const noGas = parsed((m) => void m.sites.splice(1, 1))
    expect(codes(noGas)).toContain("gas-desert")
    expect(noGas.ok).toBe(true)

    // 1.2 tanks: 40% left at the gas site, so nobody-votes drives past and runs dry at mile 10.
    const skipped = parsed((m) => (m.route.tanksPerTrip = 1.2))
    expect(fuelPlan(skipped.map).gasStops[0]?.stops).toBe(false)
    expect(fuelPlan(skipped.map).emptyAtMile).toBeCloseTo(10, 6)
    expect(codes(skipped)).toContain("gas-desert")
  })

  it("prices gas in whole coins scaled by costScale", () => {
    expect(gasCost(13.5, 8)).toBe(108)
    expect(gasCost(13.5, 8, 1.5)).toBe(162)
    expect(gasCost(0.01, 8)).toBe(1)
    expect(gasCost(0, 8)).toBe(0)
  })

  it("warns that gas at the destination is ignored", () => {
    const result = parsed((m) => (m.sites[3]!.services = { gas: { pricePerGallon: 5 } }))
    expect(codes(result)).toContain("gas-at-destination")
  })
})

describe("van and incidents (Phase 3)", () => {
  function parsed(mutate?: (map: TripMapInput) => void) {
    const input = clone()
    mutate?.(input)
    return parseTripMap(input)
  }

  it("checks custom offers through validateShop and counts them as a shop", () => {
    const seen: unknown[] = []
    const result = parsed((m) => {
      m.sites[0]!.shop = { offers: [{ definitionId: "road-trip:jetpack" }] }
    })
    expect(codes(result)).not.toContain("empty-shop")
    const blocked = parseTripMap(clone(), {
      validateShop: (req) => {
        seen.push(req)
        const bad = req.offers?.find((o) => o.definitionId === "road-trip:cb-radio")
        return bad ? { ok: false, errors: ['Unknown item "road-trip:cb-radio"'] } : { ok: true }
      },
    })
    expect(blocked.issues).toContainEqual(
      expect.objectContaining({
        code: "unknown-item",
        siteId: "hanks-garage",
        path: "sites.4.shop.offers",
      }),
    )
    expect(seen).toContainEqual({
      offers: [{ definitionId: "road-trip:fix-a-flat" }, { definitionId: "road-trip:aaa-card" }],
    })
    expect(codes(parsed((m) => (m.sites[0]!.shop = {})))).toContain("empty-shop")
  })

  it("rejects malformed offer ids", () => {
    expect(
      parsed((m) => (m.sites[0]!.shop = { offers: [{ definitionId: "fix-a-flat" }] })).ok,
    ).toBe(false)
  })

  it("lints scripted events: duplicates, past the destination, no Mechanic ahead", () => {
    const result = parsed((m) => {
      m.scriptedEvents = [
        { id: "a", atMile: 3, incident: "traffic-jam" },
        { id: "a", atMile: 5, incident: "traffic-jam" },
        { id: "late", atMile: 12, incident: "blown-tire" },
        { id: "boom", atMile: 11, incident: "engine-failure" },
      ]
    })
    expect(codes(result)).toEqual(
      expect.arrayContaining(["duplicate-event-id", "event-beyond-route", "no-mechanic"]),
    )
    const covered = parsed((m) => {
      m.scriptedEvents = [{ id: "boom", atMile: 7, incident: "engine-failure" }]
    })
    expect(codes(covered)).not.toContain("no-mechanic")
  })

  it("won't script Out of Gas", () => {
    const result = parsed((m) => {
      m.scriptedEvents = [{ id: "dry", atMile: 3, incident: "out-of-gas" as "traffic-jam" }]
    })
    expect(result.ok).toBe(false)
  })

  it("warns about a Mechanic at the destination", () => {
    expect(
      codes(parsed((m) => (m.sites[3]!.services = { mechanic: true }))),
    ).toContain("mechanic-at-destination")
  })

  it("ships Gas Station offers and a Mechanic preset", () => {
    const gas = GENERIC_SITE_PRESETS.find((p) => p.id === "gas-station")!
    expect(gas.site.shop?.offers?.map((o) => o.definitionId)).toEqual([
      "road-trip:fix-a-flat",
      "road-trip:aaa-card",
    ])
    const mechanic = GENERIC_SITE_PRESETS.find((p) => p.id === "mechanic")!
    expect(mechanic.site.services).toEqual({ mechanic: true })
    expect(mechanic.site.shop?.offers).toHaveLength(6)
  })
})

describe("site spacing", () => {
  it("rejects sites closer than the minimum spacing", () => {
    const input = clone()
    input.sites[1]!.mile = input.sites[0]!.mile + 0.05
    const result = parseTripMap(input)
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain("sites-overlap")
  })
})
