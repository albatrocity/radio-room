import { describe, expect, it } from "vitest"
import { parseTripMap } from "./parseTripMap"
import { SAMPLE_TRIP_MAP } from "./sampleMap"
import {
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
      parkMinutes: 4,
      revealMiles: 10,
      skipPoll: { leadMinutes: 1.5, durationSec: 45, default: "skip" },
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
    delete none.sites[2]!.role
    expect(codes(parseTripMap(none))).toContain("no-destination")

    const two = clone()
    two.sites[1]!.role = "destination"
    expect(codes(parseTripMap(two))).toContain("multiple-destinations")

    const short = clone()
    short.sites[2]!.mile = 11
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
        shopIds.includes("farmers-market")
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
    expect(resolveSiteSettings(map, map.sites[2]!).optional).toBe(false)
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
    expect(skipPollQuestion(map.sites[1]!, 1.5, false)).toBe("Farmers Market in 2 miles: pull off?")
    expect(skipPollQuestion(map.sites[1]!, 0.4, false)).toBe("Farmers Market in 1 mile: pull off?")
    expect(skipPollQuestion(map.sites[1]!, 2, true)).toBe("Something's up ahead. Pull off?")
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
    const venue = siteFromPreset(GENERIC_SITE_PRESETS[0]!, "venue", 12)
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
    // Sample: record store (skip default) and farmers market (stop default), 4 min each.
    expect(plan()).toEqual({ mandatoryMs: 0, expectedMs: 4 * 60_000, maxMs: 8 * 60_000 })
    expect(plan((m) => (m.sites[0]!.mandatory = true))).toEqual({
      mandatoryMs: 4 * 60_000,
      expectedMs: 8 * 60_000,
      maxMs: 8 * 60_000,
    })
  })

  it("honors known decisions and a mile cutoff for a live trip", () => {
    expect(
      plan(undefined, { decisionFor: (site) => (site.id === "record-store" ? "stop" : "skip") }),
    ).toEqual({ mandatoryMs: 4 * 60_000, expectedMs: 4 * 60_000, maxMs: 4 * 60_000 })
    expect(plan(undefined, { afterMile: 4 }).maxMs).toBe(4 * 60_000)
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
