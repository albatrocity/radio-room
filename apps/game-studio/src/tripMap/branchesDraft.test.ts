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
