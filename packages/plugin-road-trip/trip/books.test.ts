import { describe, expect, it } from "vitest"
import { SAMPLE_TRIP_MAP, type TripMapInput } from "@repo/road-trip-map"
import { readBook } from "./books"
import { installPart, triggerIncident } from "./incidents"
import { MIN, T0, TripSim } from "./testSim"
import { depart, endTrip, pourGas } from "./transitions"

const ADA = { userId: "ada", name: "ada" }
const BO = { userId: "bo", name: "bo" }

/** Full sample map with a roomy tank, so gas stays out of the way. */
function incidentTrip(): TripSim {
  const map = structuredClone(SAMPLE_TRIP_MAP)
  map.route.tanksPerTrip = 0.8
  return new TripSim(map)
}

/** No gas stations, so the tank runs low and then dry. */
function dryTrip(): TripSim {
  const map: TripMapInput = structuredClone(SAMPLE_TRIP_MAP)
  map.sites = map.sites.filter((site) => !site.services?.gas && !site.services?.mechanic)
  delete map.events
  return new TripSim(map)
}

function signBodies(sim: TripSim): string[] {
  return sim.effects.flatMap(({ effect }) =>
    effect.type === "sign" && effect.body ? [effect.body] : [],
  )
}

describe("books (ADR 0228)", () => {
  it("levels up a series, and a book past your level goes over your head", () => {
    const sim = incidentTrip()
    expect(sim.apply(readBook("advanced-automobile-mechanics", ADA))).toBe(true)
    expect(sim.state.books?.mechanics).toBeUndefined()
    expect(sim.log.at(-1)).toMatchObject({ kind: "book-read", learned: false })

    expect(sim.apply(readBook("basics-of-automobile-mechanics", ADA))).toBe(true)
    expect(sim.apply(readBook("basics-of-automobile-mechanics", ADA))).toBe(false)
    expect(sim.apply(readBook("advanced-automobile-mechanics", ADA))).toBe(true)
    expect(sim.state.books?.mechanics?.ada).toMatchObject({ level: 2, name: "ada" })
    expect(sim.signs()).toContain("ada read Advanced Automobile Mechanics")
  })

  it("only reader-scope books apply a buff to the reader", () => {
    const sim = incidentTrip()
    sim.apply(readBook("negotiating-for-dummies", ADA))
    sim.apply(readBook("defensive-driving", ADA))
    const buffs = sim.effects.filter(({ effect }) => effect.type === "book-buff")
    expect(buffs.map(({ effect }) => effect)).toEqual([
      { type: "book-buff", userId: "ada", shortId: "negotiating-for-dummies" },
    ])
  })

  it("forgets reader buffs when the trip ends, and books stay in the bag after", () => {
    const sim = incidentTrip()
    sim.apply(readBook("investment-advice", ADA))
    sim.apply(depart)
    sim.apply(endTrip)
    expect(sim.effects.map(({ effect }) => effect)).toContainEqual({
      type: "forget-books",
      userIds: ["ada"],
    })
    expect(sim.apply(readBook("negotiating-for-dummies", BO))).toBe(false)
  })

  it("Defensive Driving softens a jam and credits the reader", () => {
    const sim = incidentTrip()
    sim.apply(readBook("defensive-driving", ADA))
    sim.apply(depart)
    sim.runUntil(T0 + MIN)
    sim.apply(triggerIncident("traffic-jam"))
    expect(sim.current.mph).toBeCloseTo(30, 9)
    expect(
      signBodies(sim).some((b) =>
        b.startsWith("ada read Defensive Driving, so the jam isn't quite so slow."),
      ),
    ).toBe(true)
  })

  it("the horn wins over Defensive Driving, and nobody is credited", () => {
    const sim = incidentTrip()
    sim.apply(installPart("obnoxious-horn", ADA))
    sim.apply(readBook("defensive-driving", BO))
    sim.apply(depart)
    sim.apply(triggerIncident("traffic-jam"))
    expect(sim.current.mph).toBeCloseTo(60 * 0.55, 9)
    expect(signBodies(sim).some((b) => b.includes("read Defensive Driving"))).toBe(false)
  })

  it("mechanics books shorten a breakdown and name readers at the level in effect", () => {
    const basics = incidentTrip()
    basics.apply(readBook("basics-of-automobile-mechanics", ADA))
    basics.apply(readBook("basics-of-automobile-mechanics", BO))
    basics.apply(depart)
    basics.runUntil(T0 + 2 * MIN)
    basics.apply(triggerIncident("engine-failure"))
    expect(signBodies(basics)).toContainEqual(
      expect.stringContaining(
        "ada and bo read The Basics of Automobile Mechanics, so this takes 25% less time.",
      ),
    )

    const advanced = incidentTrip()
    advanced.apply(readBook("basics-of-automobile-mechanics", ADA))
    advanced.apply(readBook("basics-of-automobile-mechanics", BO))
    advanced.apply(readBook("advanced-automobile-mechanics", BO))
    advanced.apply(depart)
    advanced.runUntil(T0 + 2 * MIN)
    advanced.apply(triggerIncident("engine-failure"))
    expect(signBodies(advanced)).toContainEqual(
      expect.stringContaining("bo read Advanced Automobile Mechanics, so this takes half as long."),
    )
  })
})

describe("Gas Canister (ADR 0228)", () => {
  it("pours only while driving, capped at the tank", () => {
    const sim = dryTrip()
    expect(sim.apply(pourGas(3, ADA))).toBe(false)
    sim.apply(depart)
    expect(sim.apply(pourGas(3, ADA))).toBe(false)

    sim.runUntil(T0 + MIN)
    const before = sim.gallons()
    expect(sim.apply(pourGas(3, ADA))).toBe(true)
    expect(sim.gallons()).toBeCloseTo(sim.state.tankGallons, 6)
    expect(sim.gallons() - before).toBeLessThan(3)
    expect(sim.signs()).toContain("ada poured in a Gas Canister")
    expect(sim.log.at(-1)).toMatchObject({ kind: "fuel", level: "poured", name: "ada" })
  })

  it("lifts the van out of low fuel, but never rescues an empty tank", () => {
    const sim = dryTrip()
    sim.apply(depart)
    const lowAt = Array.from({ length: 60 }, (_, i) => T0 + (i + 1) * 10_000).find((at) => {
      sim.runUntil(at)
      return sim.state.fuelFlags.includes("low")
    })
    expect(lowAt).toBeDefined()
    const before = sim.gallons()
    expect(sim.apply(pourGas(3, ADA))).toBe(true)
    expect(sim.gallons()).toBeCloseTo(before + 3, 6)
    expect(sim.state.fuelFlags).not.toContain("low")
    expect(sim.state.incident).toBeUndefined()

    const emptyAt = Array.from({ length: 120 }, (_, i) => lowAt! + (i + 1) * 10_000).find((at) => {
      sim.runUntil(at)
      return sim.state.fuelFlags.includes("empty")
    })
    expect(emptyAt).toBeDefined()
    expect(sim.state.incident).toBeDefined()
    expect(sim.apply(pourGas(3, ADA))).toBe(false)
    expect(sim.state.fuelFlags).toContain("empty")
  })
})
