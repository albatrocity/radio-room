import { describe, expect, it } from "vitest"
import { SAMPLE_TRIP_MAP, type TripMapInput, type TripStore } from "@repo/road-trip-map"
import { TripSimRoom, freezeStoreForRoom } from "./simRoom"
import { MIN, T0, TripSim } from "./testSim"
import { depart } from "./transitions"

/** The Phase 1 trip: no gas, no Mechanic, no scripted events. */
function noGas(): TripMapInput {
  const map = structuredClone(SAMPLE_TRIP_MAP)
  map.sites = map.sites.filter((site) => !site.services?.gas && !site.services?.mechanic)
  delete map.scriptedEvents
  map.route.tanksPerTrip = 0.8
  return map
}

function room(input: TripMapInput = noGas()) {
  let wall = T0
  const clock = () => wall
  const sim = new TripSimRoom(input, { roomId: "studio-room", clock })
  return { sim, advanceWall: (ms: number) => (wall += ms) }
}

describe("TripSim.stepNext", () => {
  it("fires exactly one event per call, in the order runUntil fires them", () => {
    const stepped = new TripSim(noGas())
    const ran = new TripSim(noGas())
    stepped.votes["record-store"] = { stop: 3, skip: 5 }
    ran.votes["record-store"] = { stop: 3, skip: 5 }
    stepped.apply(depart)
    ran.apply(depart)
    ran.runUntil(T0 + 30 * MIN)

    const kinds: string[] = []
    for (let i = 0; i < 100; i++) {
      const before = stepped.now
      const step = stepped.stepNext()
      if (!step) break
      expect(step.event.at).toBeGreaterThanOrEqual(before)
      expect(stepped.now).toBe(step.event.at)
      kinds.push(step.event.kind)
    }

    expect(stepped.log).toEqual(ran.log)
    expect(stepped.state.status).toBe("arrived")
    expect(kinds[0]).toBe("reveal")
    expect(kinds).toContain("poll-close")
  })

  it("returns the log and effects produced by that step only", () => {
    const sim = new TripSim(noGas())
    sim.apply(depart)
    const step = sim.stepNext()!
    expect(step.event).toMatchObject({ kind: "reveal", siteId: "record-store", at: T0 + MIN })
    expect(step.log).toEqual([
      expect.objectContaining({ kind: "site", siteId: "record-store", phase: "revealed" }),
    ])
    expect(step.effects.map((e) => e.type)).toEqual(["sign"])
  })

  it("peekNext names nothing before departure", () => {
    expect(new TripSim(noGas()).peekNext()).toBeNull()
  })
})

describe("TripSimRoom", () => {
  it("turns signs into road-sign chat with increasing wall-clock timestamps", () => {
    const { sim } = room()
    sim.depart()
    sim.step()
    expect(sim.messages.map((m) => m.meta?.title)).toEqual([
      "On the road · Concert Run",
      "Coming up: Dusty Boots Records",
    ])
    expect(sim.messages[0]?.meta).toMatchObject({ type: "alert", theme: "road-trip" })
    const [a, b] = sim.messages.map((m) => Date.parse(m.timestamp))
    expect(b!).toBeGreaterThan(a!)
  })

  it("opens a road-sign poll that never expires, and closes it with the studio's votes", () => {
    const { sim } = room()
    sim.depart()
    while (!sim.poll && sim.step());
    expect(sim.openPollSiteId()).toBe("record-store")
    expect(sim.poll).toMatchObject({
      question: "Dusty Boots Records in 2 miles: pull off?",
      closesAt: null,
      presentation: { theme: "road-trip", headline: "DUSTY BOOTS RECORDS" },
    })
    const pollId = sim.poll!.id

    sim.setVotes({ stop: 4, skip: 1 })
    while (sim.poll && sim.step());

    expect(sim.lastClosedPoll?.poll).toMatchObject({ id: pollId, status: "closed" })
    expect(sim.lastClosedPoll?.results).toMatchObject({
      totalVotes: 5,
      winners: [`${pollId}:stop`],
    })
    expect(sim.state.sites["record-store"]?.phase).toBe("stopping")
  })

  it("freezes the store on the wall clock so the room doesn't move the van", () => {
    const { sim, advanceWall } = room()
    sim.depart()
    sim.step()
    advanceWall(5_000)
    const trip = sim.storePayload().trip as TripStore
    expect(trip.van).toMatchObject({ anchorAt: T0 + 5_000, mph: 0 })
    expect(trip.van.anchorMile).toBeCloseTo(1, 5)
    expect(trip.fuel).toMatchObject({ anchorAt: T0 + 5_000, gallonsPerMile: 0 })
    expect(trip.vanSheet.cruisingMph).toBeGreaterThan(0)
    // Departed one sim minute ago.
    expect(trip.departedAt).toBe(T0 + 5_000 - MIN)
  })

  it("shifts live countdowns onto the wall clock", () => {
    const store = {
      van: { anchorAt: 0, anchorMile: 3, mph: 60 },
      fuel: { anchorAt: 0, anchorGallons: 5, gallonsPerMile: 0.1 },
      eta: { projectedArrivalAt: 2_000, targetArrivalAt: null },
      live: { kind: "parked", label: "Stand", siteId: "s", endsAt: 1_500, shopOpen: true },
      vanSheet: { parts: [], baseMph: 60, cruisingMph: 60, speedFactors: [], mpgFactors: [], queued: 0 },
      sites: [{ id: "s", mile: 3, state: "parked", visitedAt: 900 }],
    } as unknown as TripStore
    const frozen = freezeStoreForRoom(store, 1_000, 50_000)
    expect(frozen.live).toMatchObject({ endsAt: 50_500 })
    expect(frozen.eta.projectedArrivalAt).toBe(51_000)
    expect(frozen.sites[0]?.visitedAt).toBe(49_900)
  })

  it("bumps version on every change and keeps one runId", () => {
    const { sim } = room()
    const first = sim.snapshot()
    sim.depart()
    const second = sim.snapshot()
    expect(second.version).toBeGreaterThan(first.version)
    expect(second.runId).toBe(first.runId)
  })
})
