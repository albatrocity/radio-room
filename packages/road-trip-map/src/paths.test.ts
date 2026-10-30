import { describe, expect, it } from "vitest"
import { fuelPlan, milesToNextGas, parkPlan, skipDefaultsAhead, sortedSites } from "./derive"
import { describeTripFlow } from "./flowOutline"
import { compileEventSteps, mileEvents, nearestMechanicAhead } from "./incidents"
import { parseTripMap } from "./parseTripMap"
import { enumeratePaths, linearize, startView, type TripView } from "./paths"
import { SAMPLE_BRANCH_MAP } from "./sampleBranchMap"
import { SAMPLE_TRIP_MAP } from "./sampleMap"
import type { TripMap, TripMapInput } from "./schema"

function parse(input: TripMapInput): TripMap {
  const result = parseTripMap(input)
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "))
  return result.map
}

function codes(input: TripMapInput): string[] {
  return parseTripMap(input).issues.map((i) => i.code)
}

function branch(edit: (map: TripMapInput) => void): TripMapInput {
  const map = structuredClone(SAMPLE_BRANCH_MAP)
  edit(map)
  return map
}

function view(patch: Partial<TripView>): TripView {
  return { ...startView(), ...patch }
}

describe("paths (ADR 0222)", () => {
  it("a linear map lays flat as itself: every derive helper is unchanged", () => {
    const map = parse(SAMPLE_TRIP_MAP)
    const path = linearize(map, startView())
    expect(path.map).toBe(map)
    expect(path.miles).toBe(12)
    expect(sortedSites(path.map)).toEqual(sortedSites(map))
    expect(fuelPlan(path.map)).toEqual(fuelPlan(map))
    expect(parkPlan(path.map)).toEqual(parkPlan(map))
    expect(milesToNextGas(path.map, 0)).toBe(milesToNextGas(map, 0))
    expect(nearestMechanicAhead(path.map, 0)).toEqual(nearestMechanicAhead(map, 0))
    expect(mileEvents(path.map)).toEqual(mileEvents(map))
    const defaults = { fromMile: 0, gallons: 10, gallonsPerMile: 1 }
    for (const site of map.sites) {
      expect(skipDefaultsAhead(path.map, defaults)(site)).toBe(
        skipDefaultsAhead(map, defaults)(site),
      )
    }
  })

  it("undecided forks count as stay, and locked layers drop out", () => {
    const map = parse(SAMPLE_BRANCH_MAP)
    const path = linearize(map, startView())
    expect(path.miles).toBe(30)
    expect(path.map.sites.map((s) => s.id)).toEqual([
      "welcome-center",
      "gas-stop",
      "diner",
      "arena",
    ])
    expect(path.forks.map((f) => [f.routeId, f.odometer])).toEqual([
      ["scenic-byway", 14],
      ["detour", 24],
    ])
    expect(path.map.events?.map((e) => e.id)).toEqual(["road-closed"])
  })

  it("a decided take lays the route in at odometer miles, and the rejoin skips the parent stretch", () => {
    const map = parse(SAMPLE_BRANCH_MAP)
    const path = linearize(
      map,
      view({
        layersActive: new Set(["local-tips"]),
        junctionDecisions: { "scenic-byway": "take" },
      }),
    )
    expect(path.miles).toBe(27)
    expect(path.map.sites.map((s) => [s.id, s.mile])).toEqual([
      ["welcome-center", 3],
      ["hidden-falls", 8],
      ["gas-stop", 12],
      ["overlook", 16],
      ["swimming-hole", 24],
      ["arena", 27],
    ])
    expect(path.ends).toEqual([
      {
        routeId: "scenic-byway",
        odometer: 19,
        next: { route: "main", fromMile: 22, odometerStart: 19 },
        bypasses: ["diner"],
      },
    ])
    // The base burn per mile doesn't change with the path's length.
    expect(path.map.route.tanksPerTrip / path.miles).toBeCloseTo(map.route.tanksPerTrip / 30)
  })

  it("driven legs keep their content at the miles the van passed it", () => {
    const map = parse(SAMPLE_BRANCH_MAP)
    const path = linearize(
      map,
      view({
        legs: [
          { route: "main", fromMile: 0, odometerStart: 0 },
          { route: "scenic-byway", fromMile: 0, odometerStart: 14 },
          { route: "main", fromMile: 22, odometerStart: 19 },
        ],
        junctionsDone: new Set(["scenic-byway"]),
      }),
    )
    expect(path.segments.map((s) => [s.route, s.fromMile, s.toMile, s.driven])).toEqual([
      ["main", 0, 14, true],
      ["scenic-byway", 0, 5, true],
      ["main", 22, 30, false],
    ])
    expect(path.forks.map((f) => f.routeId)).toEqual(["detour"])
  })

  it("enumerates every distinct path through the forks", () => {
    const { paths, capped } = enumeratePaths(parse(SAMPLE_BRANCH_MAP))
    expect(capped).toBe(false)
    expect(paths.map((p) => p.path.miles)).toEqual([30, 27, 32, 29])
  })

  it("describes the flow for authors", () => {
    const outline = describeTripFlow(parse(SAMPLE_BRANCH_MAP))
    expect(outline.layers[0]).toMatchObject({
      unlockedBy: ["Welcome Center"],
      maps: ["Local Map"],
      sites: ["Hidden Falls", "Swimming Hole"],
    })
    expect(outline.maps).toEqual([
      { id: "local", name: "Local Map", icon: "🗺️", layers: ["Local tips"], soldAt: ["Gas Stop"] },
    ])
    expect(outline.routes.map((r) => [r.id, r.divertedBy])).toEqual([
      ["scenic-byway", []],
      ["detour", ["Road closed (Take the detour)"]],
    ])
    expect(outline.paths.map((p) => p.label)).toContain("Main → Scenic Byway → Main")
  })

  it("names a departure unlock apart from the visit", () => {
    const outline = describeTripFlow(
      parse(
        branch((map) => {
          map.sites[0]!.onDepart = [{ kind: "unlock", layer: "local-tips" }]
        }),
      ),
    )
    expect(outline.layers[0]?.unlockedBy).toEqual([
      "Welcome Center",
      "Welcome Center, on departure",
    ])
  })
})

describe("branch lint (ADR 0222)", () => {
  it("accepts the branching sample", () => {
    expect(codes(SAMPLE_BRANCH_MAP)).toEqual([])
  })

  it.each<[string, (map: TripMapInput) => void]>([
    ["unknown-route", (m) => void (m.sites[1]!.route = "nowhere")],
    ["unknown-layer", (m) => void (m.sites[1]!.layer = "nope")],
    ["unknown-layer", (m) => void (m.sites[0]!.onVisit = [{ kind: "unlock", layer: "nope" }])],
    ["unknown-layer", (m) => void (m.sites[0]!.onDepart = [{ kind: "unlock", layer: "nope" }])],
    ["unknown-route", (m) => void (m.events![1]!.outcomes = [{ kind: "divert", route: "nope" }])],
    ["fork-beyond-route", (m) => void (m.routes![0]!.from.mile = 40)],
    ["rejoin-beyond-route", (m) => void (m.routes![0]!.end = { kind: "rejoin", mile: 45 })],
    ["rejoin-before-fork", (m) => void (m.routes![0]!.end = { kind: "rejoin", mile: 10 })],
    ["route-without-destination", (m) => void (m.routes![0]!.end = { kind: "destination" })],
    [
      "rejoin-with-destination",
      (m) =>
        void m.sites.push({
          id: "camp",
          name: "Camp",
          description: "x",
          icon: "⛺",
          mile: 4,
          route: "scenic-byway",
          role: "destination",
        }),
    ],
    [
      "divert-behind",
      (m) =>
        void (m.sites.find((s) => s.id === "diner")!.onVisit = [
          { kind: "divert", route: "scenic-byway" },
        ]),
    ],
    [
      "choice-default",
      (m) => {
        const choice = m.events![1]!.resolution![0]!
        if (choice.kind === "choice") choice.default = "nope"
      },
    ],
    [
      "slow-multiple-choices",
      (m) => {
        const event = m.events![1]!
        event.effect = { kind: "slow", factor: 0.5 }
        event.durationMinutes = 1
        event.resolution = [event.resolution![0]!, event.resolution![0]!]
      },
    ],
    [
      "sites-overlap",
      (m) =>
        void m.sites.push({
          id: "falls-2",
          name: "Falls 2",
          description: "x",
          icon: "💧",
          mile: 8.05,
          layer: "local-tips",
        }),
    ],
    ["unknown-map", (m) => void (m.layers![0]!.maps = ["atlas"])],
    ["duplicate-map-id", (m) => void m.maps!.push({ id: "local", name: "Another" })],
    [
      "route-cycle",
      (m) => {
        m.routes!.push({
          id: "spur",
          name: "Spur",
          driveMinutes: 2,
          from: { route: "scenic-byway", mile: 1 },
          end: { kind: "rejoin", route: "main", mile: 2 },
          entry: { kind: "vote", default: "stay" },
        })
      },
    ],
  ])("errors: %s", (code, edit) => {
    const result = parseTripMap(branch(edit))
    expect(result.issues.filter((i) => i.severity === "error").map((i) => i.code)).toContain(code)
  })

  it.each<[string, (map: TripMapInput) => void]>([
    [
      "layer-never-unlocked",
      (m) => {
        delete m.sites[0]!.onVisit
        delete m.layers![0]!.maps
      },
    ],
    ["map-reveals-nothing", (m) => void delete m.layers![0]!.maps],
    ["route-never-taken", (m) => void (m.events![1]!.resolution = [{ kind: "wait", minutes: 1 }])],
    ["mandatory-bypassable", (m) => void (m.sites.find((s) => s.id === "diner")!.mandatory = true)],
  ])("warns: %s", (code, edit) => {
    const result = parseTripMap(branch(edit))
    expect(result.issues.filter((i) => i.severity === "warning").map((i) => i.code)).toContain(code)
  })

  it("checks fuel on every path, naming the path", () => {
    const result = parseTripMap(
      branch((m) => {
        m.route.tanksPerTrip = 1.6
        m.sites = m.sites.filter((s) => s.id !== "gas-stop")
      }),
    )
    const deserts = result.issues.filter((i) => i.code === "gas-desert").map((i) => i.message)
    expect(deserts.some((message) => message.includes("(Main → Scenic Byway → Main)"))).toBe(true)
  })
})

describe("event choices compile (ADR 0222)", () => {
  const choice = {
    kind: "choice" as const,
    question: "Pick them up?",
    seconds: 30,
    default: "no",
    options: [
      { id: "yes", label: "Sure", outcomes: [] },
      { id: "no", label: "Nope", outcomes: [] },
    ],
  }
  const map = parse(SAMPLE_TRIP_MAP)

  it("a stop event runs the choice as its own held step", () => {
    const steps = compileEventSteps(
      map,
      { id: "x", name: "X", icon: "x", effect: { kind: "stop" }, resolution: [choice] },
      { mile: 0, parts: [] },
    )
    expect(steps).toEqual([expect.objectContaining({ kind: "choice", holds: true, ms: 30_000 })])
  })

  it("a slowdown hosts the choice", () => {
    const steps = compileEventSteps(
      map,
      {
        id: "x",
        name: "X",
        icon: "x",
        effect: { kind: "slow", factor: 0.5 },
        durationMinutes: 1,
        resolution: [choice],
      },
      { mile: 0, parts: [] },
    )
    expect(steps).toEqual([
      expect.objectContaining({ kind: "slow", choice: expect.objectContaining({ default: "no" }) }),
    ])
  })

  it("an event with no effect compiles to its choice alone, without holding the van", () => {
    const steps = compileEventSteps(
      map,
      { id: "x", name: "X", icon: "x", resolution: [choice, { kind: "wait", minutes: 1 }] },
      { mile: 0, parts: [] },
    )
    expect(steps).toEqual([expect.objectContaining({ kind: "choice", holds: false })])
  })
})
