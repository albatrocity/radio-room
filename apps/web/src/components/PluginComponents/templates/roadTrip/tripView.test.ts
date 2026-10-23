import { describe, expect, it, vi } from "vitest"
import type { TripStore, TripStoreSite } from "@repo/road-trip-map"
import {
  formatDriveCountdown,
  refillingGallons,
  stripContext,
  stripReadout,
  vanPhase,
} from "./tripView"

vi.mock("../../../../hooks/useActors", () => ({ useNow: () => 0 }))
vi.mock("../../context", () => ({ usePluginComponentContext: () => ({ store: {} }) }))

const NOW = 1_000_000

function trip(overrides: Partial<TripStore> = {}): TripStore {
  return {
    status: "driving",
    tripId: "t1",
    mapTitle: "Coast Run",
    routeMiles: 100,
    sites: [],
    van: { anchorAt: NOW, anchorMile: 0, mph: 60 },
    fuel: {
      anchorAt: NOW,
      anchorGallons: 10,
      gallonsPerMile: 0.05,
      drivingGallonsPerMile: 0.05,
      tank: 10,
      lowPct: 0.2,
    },
    funds: { mode: "automatic" },
    costScale: 1,
    eta: { projectedArrivalAt: null, targetArrivalAt: null },
    vanSheet: { parts: [], baseMph: 60, cruisingMph: 60, speedFactors: [], mpgFactors: [], queued: 0 },
    visitedCount: 0,
    siteCount: 1,
    ...overrides,
  }
}

const diner = (state: TripStoreSite["state"] = "ahead"): TripStoreSite => ({
  id: "diner",
  mile: 10,
  state,
  name: "Diner",
  icon: "🍔",
})

describe("formatDriveCountdown", () => {
  it("shows seconds under an hour", () => {
    expect(formatDriveCountdown(12 * 60_000 + 7_000)).toBe("12:07")
  })

  it("rounds up so it never reads 0:00 early", () => {
    expect(formatDriveCountdown(400)).toBe("0:01")
    expect(formatDriveCountdown(-5)).toBe("0:00")
  })

  it("rolls over to hours", () => {
    expect(formatDriveCountdown(3 * 3_600_000 + 5_000)).toBe("3:00:05")
    expect(formatDriveCountdown(3_600_000 + 61_000)).toBe("1:01:01")
  })
})

describe("vanPhase", () => {
  it("reads trip status first", () => {
    expect(vanPhase(trip({ status: "loaded" }), 0)).toBe("ready")
    expect(vanPhase(trip({ status: "late" }), 0)).toBe("arrived")
    expect(vanPhase(trip({ status: "stranded" }), 0)).toBe("ended")
  })

  it("is exiting only when the next site is stopping", () => {
    expect(vanPhase(trip({ sites: [diner("polling")] }), 0)).toBe("cruising")
    expect(vanPhase(trip({ sites: [diner("stopping")] }), 0)).toBe("exiting")
  })

  it("is parked while live parked, held when otherwise stopped", () => {
    const parked = trip({
      van: { anchorAt: NOW, anchorMile: 10, mph: 0 },
      live: { kind: "parked", label: "Diner", siteId: "diner", endsAt: NOW + 90_000, shopOpen: false },
    })
    expect(vanPhase(parked, 10)).toBe("parked")
    expect(vanPhase(trip({ van: { anchorAt: NOW, anchorMile: 0, mph: 0 } }), 0)).toBe("held")
  })
})

describe("stripReadout", () => {
  it("shows the next site and a ticking countdown while cruising", () => {
    expect(stripReadout(trip({ sites: [diner()] }), 0, NOW)).toEqual({
      status: "Cruising",
      destination: "Diner",
      countdown: "10:00",
    })
  })

  it("shows the speed instead of an unrevealed destination", () => {
    const readout = stripReadout(trip({ sites: [{ id: "x", mile: 5, state: "unrevealed" }] }), 0, NOW)
    expect(readout).toEqual({ status: "Cruising", destination: "60 mph" })
  })

  it("shows the speed when no site is ahead", () => {
    expect(stripReadout(trip({ sites: [] }), 0, NOW)).toEqual({
      status: "Cruising",
      destination: "60 mph",
    })
  })

  it("counts down the stop while parked", () => {
    const parked = trip({
      van: { anchorAt: NOW, anchorMile: 10, mph: 0 },
      live: { kind: "parked", label: "Diner", siteId: "diner", endsAt: NOW + 90_000, shopOpen: true },
    })
    expect(stripReadout(parked, 10, NOW)).toEqual({
      status: "Parked",
      destination: "Diner · shop open",
      countdown: "1:30",
    })
  })

  it("keeps the incident headline even while the van rolls", () => {
    const towing = trip({
      live: { kind: "incident", label: "", incident: "engine-failure", name: "Engine failure" },
    })
    expect(stripReadout(towing, 0, NOW, "cruising")).toEqual({ status: "🔧 Engine failure" })
  })
})

describe("refillingGallons", () => {
  const refilling = trip()
  refilling.fuel.refill = { fromGallons: 2, startedAt: NOW, endsAt: NOW + 20_000 }

  it("climbs to a full tank across the window before the tank fills", () => {
    expect(refillingGallons(refilling, 2, NOW)).toBe(2)
    expect(refillingGallons(refilling, 2, NOW + 10_000)).toBe(6)
    expect(refillingGallons(refilling, 2, NOW + 30_000)).toBe(10)
  })

  it("climbs no higher than the real level after an instant fill", () => {
    expect(refillingGallons(refilling, 9.5, NOW + 10_000)).toBe(6)
    expect(refillingGallons(refilling, 9.5, NOW + 20_000)).toBe(9.5)
  })

  it("shows the real level with no refill in view", () => {
    expect(refillingGallons(trip(), 3, NOW)).toBe(3)
  })
})

describe("stripContext", () => {
  it("uses the ticking countdown in the Next sentence", () => {
    expect(stripContext(trip({ sites: [diner()] }), 0, NOW + 0)).toBe("Next: Diner · 10:00")
  })
})
