import { describe, expect, it } from "vitest"
import {
  parseTripMap,
  SAMPLE_BRANCH_MAP,
  SAMPLE_TRIP_MAP,
  type TripMapInput,
} from "@repo/road-trip-map"
import {
  addAltRoute,
  addLayer,
  moveRouteEnd,
  moveRouteFork,
  removeAltRoute,
  removeLayer,
  scaleTripDrive,
  trackLayout,
  updateAltRoute,
} from "./branchesDraft"
import { mapJson, moveSite, updateSite } from "./tripMapDraft"

function ok(draft: TripMapInput) {
  const parsed = parseTripMap(mapJson(draft))
  expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([])
  return parsed
}

describe("branch drafts (ADR 0222)", () => {
  it("stamps a shortcut and a layer, drags the handles, and round-trips through parseTripMap", () => {
    let draft = structuredClone(SAMPLE_TRIP_MAP)
    const route = addAltRoute(draft)
    draft = route.draft
    const layer = addLayer(draft)
    draft = layer.draft
    draft = moveRouteFork(draft, route.routeId, 2.04)
    draft = moveRouteEnd(draft, route.routeId, 9.96)
    draft = updateSite(draft, "record-store", { layer: layer.layerId, onVisit: undefined })
    draft = updateSite(draft, "gas-n-go", { onVisit: [{ kind: "unlock", layer: layer.layerId }] })
    const shortcut = draft.routes!.find((r) => r.id === route.routeId)!
    expect(shortcut.from.mile).toBe(2)
    expect(shortcut.end).toEqual({ kind: "rejoin", mile: 10 })
    const parsed = ok(draft)
    expect(parsed.map?.routes?.[0]?.id).toBe(route.routeId)
  })

  it("clamps pins and handles to their own route", () => {
    let draft = structuredClone(SAMPLE_BRANCH_MAP)
    draft = moveSite(draft, "overlook", 40)
    expect(draft.sites.find((s) => s.id === "overlook")!.mile).toBe(4.9)
    draft = moveRouteFork(draft, "scenic-byway", 99)
    expect(draft.routes![0]!.from.mile).toBe(29.9)
  })

  it("keeps a route destination pinned to the route's end", () => {
    let draft = structuredClone(SAMPLE_BRANCH_MAP)
    draft = updateAltRoute(draft, "scenic-byway", { end: { kind: "destination" } })
    draft = updateSite(draft, "overlook", { role: "destination" })
    draft = updateAltRoute(draft, "scenic-byway", { driveMinutes: 7 })
    expect(draft.sites.find((s) => s.id === "overlook")!.mile).toBe(7)
  })

  it("removing a route drops its content and the outcomes that divert to it", () => {
    const draft = removeAltRoute(structuredClone(SAMPLE_BRANCH_MAP), "detour")
    expect(draft.routes?.map((r) => r.id)).toEqual(["scenic-byway"])
    const choice = draft.events!.find((e) => e.id === "road-closed")!.resolution![0]!
    expect(choice.kind === "choice" && choice.options[0]!.outcomes).toEqual([])
    ok(draft)
  })

  it("removing a layer keeps its stops on the road and drops its unlocks", () => {
    const draft = removeLayer(structuredClone(SAMPLE_BRANCH_MAP), "local-tips")
    expect(draft.layers).toBeUndefined()
    expect(draft.sites.find((s) => s.id === "hidden-falls")!.layer).toBeUndefined()
    expect(draft.sites.find((s) => s.id === "welcome-center")!.onVisit).toBeUndefined()
    ok(draft)
  })

  it("lays routes out on one mile scale, each starting at its fork", () => {
    const { rows, scale } = trackLayout(structuredClone(SAMPLE_BRANCH_MAP))
    expect(rows.map((r) => [r.route, r.x, r.length])).toEqual([
      ["main", 0, 30],
      ["scenic-byway", 14, 5],
      ["detour", 24, 4],
    ])
    expect(scale).toBe(30)
  })
})

describe("scaleTripDrive", () => {
  it("doubles miles, routes, forks, and rejoins, keeping the destination at the end", () => {
    const result = scaleTripDrive(structuredClone(SAMPLE_BRANCH_MAP), 60)
    if (!result.ok) throw new Error(result.error)
    const { draft } = result
    expect(draft.route.driveMinutes).toBe(60)
    expect(draft.sites.map((s) => [s.id, s.mile])).toEqual([
      ["welcome-center", 6],
      ["hidden-falls", 16],
      ["gas-stop", 24],
      ["overlook", 4],
      ["diner", 40],
      ["arena", 60],
    ])
    expect(draft.events!.map((e) => [e.id, e.mile])).toEqual([
      ["busker", 20],
      ["road-closed", 46],
    ])
    expect(draft.routes!.map((r) => [r.id, r.driveMinutes, r.from.mile, r.end])).toEqual([
      ["scenic-byway", 10, 28, { kind: "rejoin", mile: 44 }],
      ["detour", 8, 48, { kind: "rejoin", mile: 52 }],
    ])
    ok(draft)
  })

  it("leaves fuel events, stop lengths, and event durations alone", () => {
    const source = structuredClone(SAMPLE_BRANCH_MAP)
    source.sites = source.sites.map((s) => (s.id === "diner" ? { ...s, parkMinutes: 5 } : s))
    source.events = [
      ...source.events!,
      { id: "dry", name: "Out of gas", icon: "⛽", trigger: "fuel" },
      { id: "jam", name: "Jam", icon: "🚗", mile: 5, effect: { kind: "slow", factor: 0.5 }, durationMinutes: 3 },
    ]
    const result = scaleTripDrive(source, 45)
    if (!result.ok) throw new Error(result.error)
    const { draft } = result
    expect(draft.events!.find((e) => e.id === "dry")!.mile).toBeUndefined()
    expect(draft.events!.find((e) => e.id === "jam")).toMatchObject({ mile: 7.5, durationMinutes: 3 })
    expect(draft.sites.find((s) => s.id === "diner")!.parkMinutes).toBe(5)
    expect(draft.tuning).toEqual(source.tuning)
  })

  it("refuses a drive time that would push an alternate past 24 hours", () => {
    const source = updateAltRoute(structuredClone(SAMPLE_BRANCH_MAP), "scenic-byway", { driveMinutes: 60 })
    const before = structuredClone(source)
    const result = scaleTripDrive(source, 24 * 60)
    expect(result).toEqual({ ok: false, error: "Scenic Byway would drive longer than 24 hours." })
    expect(source).toEqual(before)
    expect(scaleTripDrive(source, 0).ok).toBe(false)
  })
})
