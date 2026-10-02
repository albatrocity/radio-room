import { describe, expect, it } from "vitest"
import { SAMPLE_TRIP_MAP, type TripMapInput } from "@repo/road-trip-map"
import { buildStatusLines, buildTripStore } from "./projection"
import { MIN, T0, TripSim } from "./testSim"
import {
  arriveAtSite,
  depart,
  endTrip,
  finishPark,
  gameSessionEnded,
  gameSessionStarted,
  pauseTrip,
  resumeTrip,
  siteShopScopeId,
} from "./transitions"

function sample(mutate?: (map: TripMapInput) => void): TripMapInput {
  const map = structuredClone(SAMPLE_TRIP_MAP)
  mutate?.(map)
  return map
}

describe("trip playable (Phase 1)", () => {
  it("skips the Record Store by vote, stops at the stand, and arrives", () => {
    const sim = new TripSim()
    sim.votes["record-store"] = { stop: 3, skip: 5 }
    expect(sim.apply(depart)).toBe(true)
    expect(sim.state.status).toBe("driving")
    expect(sim.legs).toHaveLength(1)

    sim.runUntil(T0 + 30 * MIN)

    expect(sim.state.sites["record-store"]?.phase).toBe("skipped")
    expect(sim.state.sites["farmers-market"]).toMatchObject({
      phase: "visited",
      visitedAt: T0 + 8 * MIN,
      defaulted: true,
    })
    expect(sim.state.status).toBe("arrived")
    // 12 min of driving + 4 min parked
    expect(sim.state.arrivedAt).toBe(T0 + 16 * MIN)

    const scope = siteShopScopeId("trip-1", "farmers-market")
    const shopEffects = sim.effects.filter(
      ({ effect }) => effect.type === "open-shop" || effect.type === "close-shop",
    )
    expect(shopEffects).toEqual([
      { at: T0 + 8 * MIN, effect: { type: "open-shop", siteId: "farmers-market", scopeId: scope } },
      { at: T0 + 12 * MIN, effect: { type: "close-shop", scopeId: scope } },
    ])
    expect(sim.effects.some(({ effect }) => effect.type === "nudge-host")).toBe(true)
    expect(sim.signs()).toEqual([
      "On the road · Concert Run",
      "Coming up: Dusty Boots Records",
      "Kept driving past Dusty Boots Records",
      "Coming up: Farmers Market",
      "EXIT 8 · FARMERS MARKET",
      "Back on the road",
      "Made it to The Concert",
    ])

    const rows = sim.log.filter(
      (e) => e.kind !== "site" || e.phase === "stopped" || e.phase === "skipped",
    )
    expect(rows.map((e) => (e.kind === "site" ? `${e.siteId}:${e.phase}` : e.kind))).toEqual([
      "departed",
      "record-store:skipped",
      "farmers-market:stopped",
      "arrived",
    ])
    expect(rows[1]).toMatchObject({
      mile: expect.closeTo(2.5 + 0.75, 1),
      votes: { stop: 3, skip: 5 },
    })
  })

  it("reveals each site before its poll opens", () => {
    const sim = new TripSim()
    sim.apply(depart)
    sim.runUntil(T0 + 30 * MIN)
    for (const siteId of ["record-store", "farmers-market"]) {
      const revealIndex = sim.log.findIndex(
        (e) => e.kind === "site" && e.siteId === siteId && e.phase === "revealed",
      )
      const pollIndex = sim.log.findIndex(
        (e) => e.kind === "site" && e.siteId === siteId && e.phase === "poll",
      )
      expect(revealIndex).toBeGreaterThanOrEqual(0)
      expect(revealIndex).toBeLessThan(pollIndex)
    }
    // revealMiles 3 → Record Store (mile 4) reveals at mile 1
    const reveal = sim.log.find(
      (e) => e.kind === "site" && e.siteId === "record-store" && e.phase === "revealed",
    )
    expect(reveal?.at).toBe(T0 + 1 * MIN)
  })

  it("keeps a mystery site hidden through its poll and reveals on arrival", () => {
    const sim = new TripSim(
      sample((m) => (m.sites[1]!.skipPoll = { default: "stop", mystery: true })),
    )
    sim.votes["record-store"] = { stop: 0, skip: 1 }
    sim.apply(depart)
    sim.runUntil(T0 + 7.5 * MIN)
    expect(sim.state.sites["farmers-market"]).toMatchObject({ phase: "stopping", revealed: false })
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.find((s) => s.id === "farmers-market")).toEqual({
      id: "farmers-market",
      mile: 8,
      state: "unrevealed",
    })
    sim.runUntil(T0 + 8 * MIN)
    expect(sim.state.sites["farmers-market"]).toMatchObject({ phase: "parked", revealed: true })
  })

  it("omits secret sites until revealed and sends lore only once visited", () => {
    const sim = new TripSim(sample((m) => (m.sites[1]!.secret = true)))
    sim.votes["record-store"] = { stop: 0, skip: 1 }
    sim.apply(depart)
    let store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.map((s) => s.id)).toEqual(["record-store", "concert"])
    sim.runUntil(T0 + 7 * MIN)
    store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    const stand = store.sites.find((s) => s.id === "farmers-market")
    expect(stand?.name).toBe("Farmers Market")
    expect(stand?.lore).toBeUndefined()
    sim.runUntil(T0 + 8 * MIN)
    store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.find((s) => s.id === "farmers-market")?.lore).toContain("peach wine")
    expect(store.live).toMatchObject({
      kind: "parked",
      label: "Farmers Market",
      endsAt: T0 + 12 * MIN,
      shopOpen: true,
    })
  })

  it("defers a poll while another is open, then applies the default before the exit", () => {
    const sim = new TripSim()
    sim.pollBusy = true
    sim.apply(depart)
    sim.runUntil(T0 + 4 * MIN)
    const runtime = sim.state.sites["record-store"]
    // the map's "keep driving" default applied ~20s before the exit
    expect(runtime?.phase).toBe("skipped")
    expect(runtime?.defaulted).toBe(true)
    expect(
      sim.log.some((e) => e.kind === "site" && e.siteId === "record-store" && e.phase === "poll"),
    ).toBe(false)
  })

  it("keeps driving silently when nobody votes", () => {
    const sim = new TripSim()
    sim.apply(depart)
    sim.runUntil(T0 + 5 * MIN)
    expect(sim.state.sites["record-store"]).toMatchObject({ phase: "skipped", defaulted: true })
    expect(sim.signs().some((s) => s.startsWith("Kept driving"))).toBe(false)
  })

  it("pulls off with no votes when the site overrides the map default", () => {
    const sim = new TripSim(sample((m) => (m.sites[0]!.skipPoll = { default: "stop" })))
    sim.apply(depart)
    sim.runUntil(T0 + 4 * MIN + 1)
    expect(sim.state.sites["record-store"]).toMatchObject({ phase: "parked", defaulted: true })
  })

  it("closes an open poll and uses its votes when the van arrives first", () => {
    const sim = new TripSim(sample((m) => (m.tuning!.skipPoll!.durationSec = 600)))
    sim.votes["record-store"] = { stop: 0, skip: 2 }
    sim.apply(depart)
    sim.runUntil(T0 + 3 * MIN)
    expect(sim.state.sites["record-store"]?.phase).toBe("polling")
    // poll closes 10s before the exit at the latest
    sim.runUntil(T0 + 4 * MIN)
    expect(sim.state.sites["record-store"]?.phase).toBe("skipped")
  })
})

describe("trip lifecycle", () => {
  it("pause stops the van and the park timer keeps running (D8)", () => {
    const sim = new TripSim()
    sim.votes["record-store"] = { stop: 0, skip: 1 }
    sim.apply(depart)
    sim.runUntil(T0 + 8 * MIN + 1)
    expect(sim.state.sites["farmers-market"]?.phase).toBe("parked")
    sim.apply(pauseTrip)
    sim.runUntil(T0 + 20 * MIN)
    expect(sim.state.sites["farmers-market"]?.phase).toBe("visited")
    expect(sim.mile()).toBeCloseTo(8, 3)
    expect(sim.state.status).toBe("driving")
    sim.apply(resumeTrip)
    sim.runUntil(T0 + 30 * MIN)
    expect(sim.state.status).toBe("arrived")
    expect(sim.state.arrivedAt).toBe(T0 + 24 * MIN)
  })

  it("pause and resume are idempotent", () => {
    const sim = new TripSim()
    expect(sim.apply(pauseTrip)).toBe(false)
    sim.apply(depart)
    expect(sim.apply(pauseTrip)).toBe(true)
    expect(sim.apply(pauseTrip)).toBe(false)
    expect(sim.apply(resumeTrip)).toBe(true)
    expect(sim.apply(resumeTrip)).toBe(false)
  })

  it("leave now ends the stop early and closes the shop", () => {
    const sim = new TripSim()
    sim.votes["record-store"] = { stop: 0, skip: 1 }
    sim.apply(depart)
    sim.runUntil(T0 + 9 * MIN)
    expect(sim.apply(finishPark())).toBe(true)
    expect(sim.effects.at(-2)?.effect).toEqual({
      type: "close-shop",
      scopeId: siteShopScopeId("trip-1", "farmers-market"),
    })
    sim.runUntil(T0 + 30 * MIN)
    expect(sim.state.arrivedAt).toBe(T0 + 13 * MIN)
  })

  it("a game session ending pauses the van until one starts", () => {
    const sim = new TripSim()
    sim.apply(depart)
    sim.runUntil(T0 + 2 * MIN)
    sim.apply(gameSessionEnded)
    sim.runUntil(T0 + 10 * MIN)
    expect(sim.mile()).toBeCloseTo(2, 3)
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.live).toEqual({ kind: "paused", label: "No game session" })
    expect(buildStatusLines(sim.state, sim.map, store).tripWarnings).toBe("No game session")
    sim.apply(gameSessionStarted)
    expect(sim.current.mph).toBe(60)
  })

  it("ending before arrival strands the trip and closes open work", () => {
    const sim = new TripSim()
    sim.apply(depart)
    sim.runUntil(T0 + 3 * MIN)
    expect(sim.state.sites["record-store"]?.phase).toBe("polling")
    sim.apply(endTrip)
    expect(sim.state.status).toBe("stranded")
    expect(sim.effects.some(({ effect }) => effect.type === "close-poll")).toBe(true)
    expect(sim.thresholds()).toEqual([])
    expect(sim.apply(endTrip)).toBe(false)
  })

  it("is late when arriving after the deadline", () => {
    const sim = new TripSim(
      sample((m) => (m.route.deadlineAt = new Date(T0 + 14 * MIN).toISOString())),
    )
    sim.apply(depart)
    sim.runUntil(T0 + 30 * MIN)
    expect(sim.state.status).toBe("late")
    expect(sim.state.targetArrivalAt).toBe(T0 + 14 * MIN)
  })

  it("projects arrival including expected stops", () => {
    const sim = new TripSim()
    sim.apply(depart)
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    // 12 min drive + the stand's "pull off" default × 4 min
    expect(store.eta.projectedArrivalAt).toBe(T0 + 16 * MIN)
    // The target counts the same expected stops (parkPlan), so a fresh trip is on target.
    expect(store.eta.targetArrivalAt).toBe(T0 + 16 * MIN)
    expect(buildStatusLines(sim.state, sim.map, store).tripEta).toBe("On target")
  })

  it("waits to arrive at a site while parked at another (no double park)", () => {
    const sim = new TripSim(
      sample((m) => {
        m.sites[0]!.mandatory = true
        m.sites[1]!.mile = m.sites[0]!.mile + 0.1
        m.sites[1]!.mandatory = true
        delete m.sites[1]!.skipPoll
      }),
    )
    sim.apply(depart)
    sim.runUntil(T0 + 4 * MIN + 1_000)
    expect(sim.state.sites["record-store"]!.phase).toBe("parked")

    // A stray arrival for the next site (e.g. fired before its schedule was
    // cancelled) must not replace the current park or close its shop.
    const second = sim.map.sites[1]!
    const result = arriveAtSite(second.id)(sim.state, {
      now: sim.now,
      mile: second.mile,
      map: sim.map,
    })
    expect(result).toBeNull()

    // After the park ends, the van reaches the next site and parks there.
    sim.runUntil(T0 + 12 * MIN)
    expect(sim.state.sites["record-store"]!.phase).toBe("visited")
    expect(sim.state.sites[second.id]!.visitedAt).toBeDefined()
  })

  it("commits the leg into state, so the ledger never projects from a stale leg", () => {
    const sim = new TripSim()
    sim.apply(depart)
    sim.now = T0 + 3 * MIN
    sim.apply(pauseTrip)
    sim.now = T0 + 5 * MIN
    sim.apply(resumeTrip)
    expect(sim.state.leg).toEqual(sim.legs.at(-1))
    // Every leg starts where the previous one ends.
    for (let i = 1; i < sim.legs.length; i++) {
      const prev = sim.legs[i - 1]!
      const leg = sim.legs[i]!
      const expected = prev.mile + (prev.mph * (leg.at - prev.at)) / 3_600_000
      expect(leg.mile).toBeCloseTo(expected, 9)
    }
    expect(sim.legs.map((l) => l.mph)).toEqual([60, 0, 60])
  })
})
