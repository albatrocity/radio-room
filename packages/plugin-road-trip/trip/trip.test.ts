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
  gasUrgency,
  liveSkipDefault,
  pauseTrip,
  resumeTrip,
  setFundsMode,
  siteShopScopeId,
} from "./transitions"
import {
  installPart,
  skipIncidentStep,
  triggerIncident,
  useIncidentItem,
} from "./incidents"

/** The full sample map: Mechanic and a scripted flat at mile 9. */
function withIncidents(mutate?: (map: TripMapInput) => void): TripMapInput {
  const map = structuredClone(SAMPLE_TRIP_MAP)
  mutate?.(map)
  return map
}

/** The Phase 1–2 trip: no Mechanic and no scripted events. */
function sample(mutate?: (map: TripMapInput) => void): TripMapInput {
  return withIncidents((map) => {
    map.sites = map.sites.filter((site) => !site.services?.mechanic)
    delete map.scriptedEvents
    mutate?.(map)
  })
}

/** The Phase 1 trip: no gas station, and a tank that never runs low. */
function noGas(mutate?: (map: TripMapInput) => void): TripMapInput {
  return sample((map) => {
    map.sites = map.sites.filter((site) => !site.services?.gas)
    map.route.tanksPerTrip = 0.8
    mutate?.(map)
  })
}

describe("trip playable (Phase 1)", () => {
  it("skips the Record Store by vote, stops at the stand, and arrives", () => {
    const sim = new TripSim(noGas())
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
    const sim = new TripSim(noGas())
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
      noGas((m) => (m.sites[1]!.skipPoll = { default: "stop", mystery: true })),
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

  it("omits secret sites until revealed and sends lore and the model only once visited", () => {
    const modelUrl = "https://cdn.listeningroom.club/assets/maps/sites/stand.glb"
    const sim = new TripSim(
      noGas((m) => {
        m.sites[1]!.secret = true
        m.sites[1]!.model = { url: modelUrl }
      }),
    )
    sim.votes["record-store"] = { stop: 0, skip: 1 }
    sim.apply(depart)
    let store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.map((s) => s.id)).toEqual(["record-store", "concert"])
    sim.runUntil(T0 + 7 * MIN)
    store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    const stand = store.sites.find((s) => s.id === "farmers-market")
    expect(stand?.name).toBe("Farmers Market")
    expect(stand?.lore).toBeUndefined()
    expect(stand?.modelUrl).toBeUndefined()
    sim.runUntil(T0 + 8 * MIN)
    store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.find((s) => s.id === "farmers-market")).toMatchObject({
      lore: expect.stringContaining("peach wine"),
      modelUrl,
    })
    expect(store.live).toMatchObject({
      kind: "parked",
      label: "Farmers Market",
      endsAt: T0 + 12 * MIN,
      shopOpen: true,
    })
  })

  it("defers a poll while another is open, then applies the default before the exit", () => {
    const sim = new TripSim(noGas())
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
    const sim = new TripSim(noGas())
    sim.apply(depart)
    sim.runUntil(T0 + 5 * MIN)
    expect(sim.state.sites["record-store"]).toMatchObject({ phase: "skipped", defaulted: true })
    expect(sim.signs().some((s) => s.startsWith("Kept driving"))).toBe(false)
  })

  it("pulls off with no votes when the site overrides the map default", () => {
    const sim = new TripSim(noGas((m) => (m.sites[0]!.skipPoll = { default: "stop" })))
    sim.apply(depart)
    sim.runUntil(T0 + 4 * MIN + 1)
    expect(sim.state.sites["record-store"]).toMatchObject({ phase: "parked", defaulted: true })
  })

  it("closes an open poll and uses its votes when the van arrives first", () => {
    const sim = new TripSim(noGas((m) => (m.tuning!.skipPoll!.durationSec = 600)))
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
    const sim = new TripSim(noGas())
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
    const sim = new TripSim(noGas())
    expect(sim.apply(pauseTrip)).toBe(false)
    sim.apply(depart)
    expect(sim.apply(pauseTrip)).toBe(true)
    expect(sim.apply(pauseTrip)).toBe(false)
    expect(sim.apply(resumeTrip)).toBe(true)
    expect(sim.apply(resumeTrip)).toBe(false)
  })

  it("leave now ends the stop early and closes the shop", () => {
    const sim = new TripSim(noGas())
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
    const sim = new TripSim(noGas())
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
    const sim = new TripSim(noGas())
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
      noGas((m) => (m.route.deadlineAt = new Date(T0 + 14 * MIN).toISOString())),
    )
    sim.apply(depart)
    sim.runUntil(T0 + 30 * MIN)
    expect(sim.state.status).toBe("late")
    expect(sim.state.targetArrivalAt).toBe(T0 + 14 * MIN)
  })

  it("projects arrival including expected stops", () => {
    const sim = new TripSim(noGas())
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
      noGas((m) => {
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
      gallonsUsed: second.mile * sim.state.baseGpm,
      map: sim.map,
      costScale: 1,
    })
    expect(result).toBeNull()

    // After the park ends, the van reaches the next site and parks there.
    sim.runUntil(T0 + 12 * MIN)
    expect(sim.state.sites["record-store"]!.phase).toBe("visited")
    expect(sim.state.sites[second.id]!.visitedAt).toBeDefined()
  })

  it("commits the leg into state, so the ledger never projects from a stale leg", () => {
    const sim = new TripSim(noGas())
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

// Sample fuel: 2.25 gal/mi, 15 gal tank, low line 2.25 gal (mile ≈ 5.67).
// Gas 'n' Go (mile 6, $8/gal) is reached with 1.5 gal: 13.5 gal for 108 coins.
describe("gas and money (Phase 2)", () => {
  it("burns fuel along the ledger and stops for gas when low (automatic levy)", () => {
    const sim = new TripSim(sample())
    sim.apply(depart)
    expect(sim.current.gpm).toBeCloseTo(2.25, 9)

    sim.runUntil(T0 + 5 * MIN)
    expect(sim.gallons()).toBeCloseTo(15 - 5 * 2.25, 6)

    sim.runUntil(T0 + 6 * MIN + 1)
    // No votes, but low fuel turns the gas site's default to "stop".
    expect(sim.state.sites["gas-n-go"]).toMatchObject({ phase: "parked", defaulted: true })
    expect(sim.state.fund).toMatchObject({ mode: "automatic", cost: 108, collected: 108 })
    expect(sim.current.mph).toBe(0)
    // 108 of 1,100 coins: everyone pays ~9.8%; the leftover coin goes to the larger fraction.
    expect(sim.wallets).toEqual({ ada: 902, bo: 90, cy: 0 })

    sim.runUntil(T0 + 6 * MIN + 21_000)
    expect(sim.state.fund).toBeUndefined()
    expect(sim.gallons()).toBe(15)
    expect(sim.state.fuelFlags).toEqual([])

    sim.runUntil(T0 + 30 * MIN)
    // 12 min drive + 2 min gas + 4 min stand
    expect(sim.state.arrivedAt).toBe(T0 + 18 * MIN)
    expect(sim.state.targetArrivalAt).toBe(T0 + 18 * MIN)
    expect(sim.signs()).toEqual([
      "On the road · Concert Run",
      "Coming up: Dusty Boots Records",
      "Coming up: Gas 'n' Go",
      "Coming up: Farmers Market",
      "Low fuel · 15%",
      "EXIT 6 · GAS 'N' GO",
      "Filled up at Gas 'n' Go",
      "Back on the road",
      "EXIT 8 · FARMERS MARKET",
      "Back on the road",
      // The second tank also runs low before the venue (1.5 gal left on arrival).
      "Low fuel · 15%",
      "Made it to The Concert",
    ])
    const fund = sim.log.find((e) => e.kind === "fund")
    expect(fund).toMatchObject({
      purpose: "gas",
      mode: "automatic",
      cost: 108,
      collected: 108,
      payers: 2,
      paid: [
        { userId: "ada", name: "ada", amount: 98 },
        { userId: "bo", name: "bo", amount: 10 },
      ],
    })
    expect(
      sim.log.filter((e) => e.kind === "fuel").map((e) => e.kind === "fuel" && e.level),
    ).toEqual(["low", "filled", "low"])
  })

  it("scales the locked cost by the session's costScale", () => {
    const sim = new TripSim(sample())
    sim.costScale = 1.5
    sim.apply(depart)
    sim.runUntil(T0 + 6 * MIN + 1)
    expect(sim.state.fund?.cost).toBe(162)
  })

  it("keeps driving past a gas site that isn't low and nobody votes for", () => {
    const sim = new TripSim(sample((m) => (m.route.tanksPerTrip = 1)))
    sim.apply(depart)
    sim.runUntil(T0 + 30 * MIN)
    expect(sim.state.sites["gas-n-go"]).toMatchObject({ phase: "skipped", defaulted: true })
    expect(sim.log.some((e) => e.kind === "fund")).toBe(false)
  })

  it("voluntary mode opens a pool that settles early when the goal is met", () => {
    const sim = new TripSim(sample())
    expect(sim.apply(setFundsMode("voluntary"))).toBe(true)
    sim.apply(depart)
    sim.runUntil(T0 + 6 * MIN + 1)
    expect(sim.state.fund).toMatchObject({ mode: "voluntary", cost: 108, endsAt: T0 + 9 * MIN })
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now, {
      costScale: 1,
      poolRaised: 0,
    })
    expect(store.live).toMatchObject({ kind: "fund", mode: "voluntary", cost: 108, raised: 0 })
    expect(store.funds).toEqual({ mode: "voluntary" })

    sim.pledge("ada", 100)
    expect(sim.state.fund).toBeDefined()
    sim.pledge("bo", 8)
    expect(sim.state.fund).toBeUndefined()
    expect(sim.gallons()).toBe(15)
    expect(sim.log.find((e) => e.kind === "fund")).toMatchObject({
      collected: 108,
      payers: 2,
    })
  })

  it("a short pool still fills the tank (D18)", () => {
    const sim = new TripSim(sample())
    sim.apply(setFundsMode("voluntary"))
    sim.apply(depart)
    sim.runUntil(T0 + 6 * MIN + 1)
    sim.pledge("bo", 20)
    // Park ends at +2 min, but the pool holds the van for its 3 min window.
    sim.runUntil(T0 + 8 * MIN + 30_000)
    expect(sim.state.sites["gas-n-go"]?.phase).toBe("visited")
    expect(sim.current.mph).toBe(0)
    sim.runUntil(T0 + 9 * MIN + 1)
    expect(sim.state.fund).toBeUndefined()
    expect(sim.gallons()).toBeCloseTo(15, 3)
    const filled = sim.effects.find(
      ({ effect }) => effect.type === "sign" && effect.title === "Filled up at Gas 'n' Go",
    )?.effect
    expect(filled).toMatchObject({ variant: "success" })
    expect(filled?.type === "sign" && filled.body).toMatch(/20 of 108|Short by 88/)
    expect(sim.log.find((e) => e.kind === "fund")).toMatchObject({ collected: 20, cost: 108 })
  })

  it("only switches funds mode before departure", () => {
    const sim = new TripSim(sample())
    sim.apply(depart)
    expect(sim.apply(setFundsMode("voluntary"))).toBe(false)
    expect(sim.state.fundsMode).toBe("automatic")
  })

  it("an empty tank is Out of Gas: fuel delivery, a wait, then a full tank", () => {
    const sim = new TripSim(sample((m) => (m.sites = m.sites.filter((s) => !s.services?.gas))))
    sim.apply(depart)
    const emptyAt = T0 + Math.round((15 / 2.25) * MIN)
    sim.runUntil(emptyAt + 1_000)
    expect(sim.state.incident).toMatchObject({ incident: "out-of-gas", source: "fuel" })
    expect(sim.current.mph).toBe(0)
    // Delivery: 30 fee + 15 gal × 10, levied straight away.
    expect(sim.state.fund).toMatchObject({ purpose: "delivery", cost: 180, collected: 180 })
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.live).toMatchObject({ kind: "fund", purpose: "delivery" })
    expect(store.vanSheet.incident).toMatchObject({ incident: "out-of-gas", stepKind: "fund" })

    sim.runUntil(emptyAt + 30_000)
    expect(sim.state.fund).toBeUndefined()
    expect(buildTripStore(sim.state, sim.map, sim.current, sim.now).live).toMatchObject({
      kind: "incident",
      incident: "out-of-gas",
    })
    sim.runUntil(emptyAt + 20_000 + 2 * MIN + 1_000)
    expect(sim.state.incident).toBeUndefined()
    expect(sim.log.filter((e) => e.kind === "fuel").at(-1)).toMatchObject({
      level: "filled",
      gallons: expect.closeTo(15, 3),
    })
    expect(sim.current.mph).toBe(60)

    sim.runUntil(T0 + 40 * MIN)
    expect(sim.state.status).toBe("arrived")
    // 12 min drive + 4 min stand + 20s levy hold + 2 min delivery
    expect(Math.abs(sim.state.arrivedAt! - (T0 + 18 * MIN + 20_000))).toBeLessThan(10)
    expect(sim.signs()).toContain("Out of gas")
    expect(sim.signs()).toContain("Fuel's in")
    expect(sim.log.find((e) => e.kind === "fund")).toMatchObject({
      purpose: "delivery",
      incident: "out-of-gas",
    })
  })

  it("gas copy turns urgent when the van would reach the site low", () => {
    const sim = new TripSim(sample())
    sim.apply(depart)
    const site = sim.map.sites.find((s) => s.id === "gas-n-go")!
    const at = (mile: number) => ({ mile, gallonsUsed: mile * 2.25 })
    expect(liveSkipDefault(sim.state, sim.map, site, at(4.5))).toBe("stop")
    expect(gasUrgency(sim.state, sim.map, site, at(4.5))).toBe("⛽ 10% · last gas before the end")
    const roomy = new TripSim(sample((m) => (m.route.tanksPerTrip = 1)))
    roomy.apply(depart)
    expect(
      liveSkipDefault(roomy.state, roomy.map, site, { mile: 4.5, gallonsUsed: 4.5 * 1.25 }),
    ).toBe("skip")
    expect(
      gasUrgency(roomy.state, roomy.map, site, { mile: 4.5, gallonsUsed: 4.5 * 1.25 }),
    ).toBeNull()
  })

  it("publishes the fuel anchor, funds mode, and gas prices", () => {
    const sim = new TripSim(sample())
    sim.apply(depart)
    sim.runUntil(T0 + 4 * MIN)
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now, { costScale: 2 })
    expect(store.fuel).toEqual({
      anchorAt: T0 + 4 * MIN,
      anchorGallons: expect.closeTo(15 - 4 * 2.25, 6),
      gallonsPerMile: 2.25,
      drivingGallonsPerMile: 2.25,
      tank: 15,
      lowPct: 0.15,
    })
    expect(store.costScale).toBe(2)
    expect(store.sites.find((s) => s.id === "gas-n-go")?.gasPrice).toBe(8)
    expect(buildStatusLines(sim.state, sim.map, store).tripFuel).toBe(
      "Gas 40% · Funds: automatic (split by wealth)",
    )
  })
})

const ADA = { userId: "ada", name: "ada" }

/** Full sample map with a roomy tank, so gas stays out of the way. */
function incidentTrip(mutate?: (map: TripMapInput) => void): TripSim {
  return new TripSim(
    withIncidents((m) => {
      m.route.tanksPerTrip = 0.8
      mutate?.(m)
    }),
  )
}

describe("van and incidents (Phase 3)", () => {
  it("parts change speed and burn, one per slot, announced", () => {
    const sim = incidentTrip()
    expect(sim.apply(installPart("turbocharger", ADA))).toBe(true)
    expect(sim.apply(installPart("turbocharger", ADA))).toBe(false)
    sim.apply(depart)
    expect(sim.current.mph).toBeCloseTo(60 * 1.25, 9)
    expect(sim.current.gpm).toBeCloseTo((sim.state.baseGpm / 0.75), 9)
    expect(sim.signs()).toContain("ada bolted on a turbocharger")

    sim.apply(installPart("aero-spoiler", ADA))
    expect(sim.current.mph).toBeCloseTo(60 * 1.25 * 1.05, 9)
    expect(sim.legs.at(-1)?.reason).toBe("factor-off")
    const sheet = buildTripStore(sim.state, sim.map, sim.current, sim.now).vanSheet
    expect(sheet.parts.map((p) => p.slot)).toEqual(["aero", "engine"])
    expect(sheet.speedFactors.map((f) => f.source)).toEqual(["aero-spoiler", "turbocharger"])
    expect(sheet.mpgFactors).toEqual([{ source: "turbocharger", label: "Turbocharger", factor: 0.75 }])
  })

  it("a scripted blown tire: shoulder window, roadside service, tire change", () => {
    const sim = incidentTrip()
    sim.apply(depart)
    sim.runUntil(T0 + 9 * MIN + 4 * MIN + 1_000)
    // Mile 9 comes after the 4 min stand at the market.
    expect(sim.state.incident).toMatchObject({ incident: "blown-tire", source: "scripted", step: 0 })
    expect(sim.state.scriptedFired).toEqual(["flat-at-9"])
    expect(sim.current.mph).toBe(0)
    const nudge = sim.effects.find(({ effect }) => effect.type === "nudge-holders")?.effect
    expect(nudge).toMatchObject({ itemIds: ["road-trip:fix-a-flat"] })
    const live = buildTripStore(sim.state, sim.map, sim.current, sim.now).live
    expect(live).toMatchObject({ kind: "incident", resolvesWith: ["road-trip:fix-a-flat"] })

    sim.runUntil(T0 + 13 * MIN + 61_000)
    expect(sim.state.fund).toMatchObject({ purpose: "roadside", cost: 40, collected: 40 })
    sim.runUntil(T0 + 13 * MIN + 60_000 + 20_000 + 90_000 + 1_000)
    expect(sim.state.incident).toBeUndefined()
    expect(sim.current.mph).toBe(60)
    sim.runUntil(T0 + 40 * MIN)
    expect(sim.state.status).toBe("arrived")
    expect(
      sim.log
        .filter((e) => e.kind === "incident")
        .map((e) => e.kind === "incident" && e.step),
    ).toEqual(["started", "cleared"])
  })

  it("Fix-a-Flat during the window patches it on the spot", () => {
    const sim = incidentTrip()
    sim.apply(depart)
    sim.runUntil(T0 + 13 * MIN + 10_000)
    expect(sim.apply(useIncidentItem("cb-radio", ADA))).toBe(false)
    expect(sim.apply(useIncidentItem("fix-a-flat", ADA))).toBe(true)
    expect(sim.state.incident).toBeUndefined()
    expect(sim.current.mph).toBe(60)
    expect(sim.signs()).toContain("ada patched the tire")
    expect(sim.log.some((e) => e.kind === "fund")).toBe(false)
    expect(sim.log.find((e) => e.kind === "incident" && e.step === "resolved")).toMatchObject({
      resolvedBy: { userId: "ada", itemId: "road-trip:fix-a-flat" },
    })
  })

  it("Road-Grip tires make the van immune to blown tires", () => {
    const sim = incidentTrip()
    sim.apply(installPart("road-grip-tires", ADA))
    sim.apply(depart)
    sim.runUntil(T0 + 13 * MIN + 10_000)
    expect(sim.state.incident).toBeUndefined()
    expect(sim.state.scriptedFired).toEqual(["flat-at-9"])
    expect(sim.signs()).toContain("Road-Grip tires to the rescue")
  })

  it("a AAA card covers the roadside fee once, then it's spent", () => {
    const sim = incidentTrip()
    sim.apply(installPart("aaa-card", ADA))
    sim.apply(depart)
    sim.runUntil(T0 + 13 * MIN + 61_000)
    expect(sim.state.fund).toBeUndefined()
    expect(sim.state.parts.membership).toBeUndefined()
    expect(sim.state.incident?.steps[sim.state.incident.step]?.kind).toBe("wait")
    expect(sim.signs()).toContain("AAA covers the roadside service")
    expect(sim.wallets).toEqual({ ada: 1_000, bo: 100, cy: 0 })
  })

  it("engine failure tows the van to the Mechanic, skipping what it passes", () => {
    const sim = incidentTrip()
    sim.apply(depart)
    sim.runUntil(T0 + 2 * MIN)
    expect(sim.apply(triggerIncident("engine-failure"))).toBe(true)
    expect(sim.state.fund).toMatchObject({ purpose: "tow", cost: 60 })

    // 20s levy hold + 60s tow-truck wait, then the tow at 45 mph.
    sim.runUntil(T0 + 2 * MIN + 81_000)
    expect(sim.current).toMatchObject({ mph: 45, gpm: 0, engine: false })
    const gallons = sim.gallons()
    sim.runUntil(T0 + 2 * MIN + 80_000 + (8 / 45) * 60 * MIN - 1_000)
    expect(sim.gallons()).toBe(gallons)

    sim.runUntil(T0 + 2 * MIN + 80_000 + (8 / 45) * 60 * MIN + 1_000)
    expect(sim.state.sites["hanks-garage"]).toMatchObject({ phase: "parked" })
    expect(sim.state.shopScopeId).toBe(siteShopScopeId("trip-1", "hanks-garage"))
    expect(sim.state.fund).toMatchObject({ purpose: "repair", cost: 100, siteId: "hanks-garage" })
    for (const id of ["record-store", "gas-n-go", "farmers-market"]) {
      expect(sim.state.sites[id]?.phase).toBe("skipped")
    }
    expect(sim.state.scriptedFired).toEqual(["flat-at-9"])
    expect(sim.log.find((e) => e.kind === "incident" && e.step === "towed")).toMatchObject({
      siteId: "hanks-garage",
      miles: expect.closeTo(8, 3),
    })

    sim.runUntil(T0 + 40 * MIN)
    expect(sim.state.status).toBe("arrived")
    expect(sim.state.sites["hanks-garage"]?.phase).toBe("visited")
    expect(sim.effects.some(({ effect }) => effect.type === "close-shop")).toBe(true)
  })

  it("a traffic jam slows the van; a CB Radio clears it", () => {
    const sim = incidentTrip()
    sim.apply(depart)
    sim.runUntil(T0 + MIN)
    sim.apply(triggerIncident("traffic-jam"))
    expect(sim.current.mph).toBeCloseTo(24, 9)
    expect(sim.legs.at(-1)?.reason).toBe("factor-on")
    expect(sim.state.incident?.stepEndsAt).toBe(T0 + 9 * MIN)
    sim.runUntil(T0 + 2 * MIN)
    expect(sim.apply(useIncidentItem("cb-radio", ADA))).toBe(true)
    expect(sim.current.mph).toBe(60)
    expect(sim.signs()).toContain("ada found a way around")
  })

  it("an obnoxious horn softens and shortens the jam", () => {
    const sim = incidentTrip()
    sim.apply(installPart("obnoxious-horn", ADA))
    sim.apply(depart)
    sim.apply(triggerIncident("traffic-jam"))
    expect(sim.current.mph).toBeCloseTo(60 * 0.55, 9)
    expect(sim.state.incident?.stepEndsAt).toBe(T0 + 6 * MIN)
  })

  it("queues an incident while parked and starts it once the van leaves", () => {
    const sim = incidentTrip((m) => delete m.scriptedEvents)
    sim.apply(depart)
    sim.runUntil(T0 + 8 * MIN + 1_000)
    expect(sim.state.sites["farmers-market"]?.phase).toBe("parked")
    expect(sim.apply(triggerIncident("traffic-jam"))).toBe(true)
    expect(sim.state.incident).toBeUndefined()
    expect(sim.state.incidentQueue).toEqual([{ incident: "traffic-jam", source: "host" }])
    sim.runUntil(T0 + 12 * MIN + 1_000)
    expect(sim.state.incident).toMatchObject({ incident: "traffic-jam" })
    expect(sim.state.incidentQueue).toEqual([])
  })

  it("host skip moves past a timed step; a waived fund is refunded", () => {
    const sim = incidentTrip()
    sim.apply(depart)
    sim.runUntil(T0 + 13 * MIN + 10_000)
    expect(sim.apply(skipIncidentStep)).toBe(true)
    expect(sim.state.fund).toMatchObject({ purpose: "roadside", collected: 40 })
    expect(sim.wallets.ada).toBeLessThan(1_000)
    expect(sim.waiveFund()).toBe(true)
    expect(sim.wallets).toEqual({ ada: 1_000, bo: 100, cy: 0 })
    expect(sim.log.find((e) => e.kind === "fund")).toMatchObject({ waived: true, collected: 0 })
    expect(sim.state.incident?.steps[sim.state.incident.step]?.kind).toBe("wait")
  })

  it("Out of Gas cuts a traffic jam short", () => {
    const sim = new TripSim(
      sample((m) => (m.sites = m.sites.filter((s) => !s.services?.gas))),
    )
    sim.apply(depart)
    sim.runUntil(T0 + 6 * MIN)
    sim.apply(triggerIncident("traffic-jam"))
    sim.runUntil(T0 + 9 * MIN)
    expect(sim.state.incident).toMatchObject({ incident: "out-of-gas" })
    expect(sim.state.speedFactors).toEqual([])
  })
})
