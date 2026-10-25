import { describe, expect, it } from "vitest"
import { SAMPLE_BRANCH_MAP, type TripMapInput } from "@repo/road-trip-map"
import { routeItemUse } from "../items"
import { contextFor } from "./commit"
import { dispatch } from "./flow"
import { revealAhead, unlockNextLayer } from "./guide"
import { skipIncidentStep, triggerIncident } from "./incidents"
import { buildTripStore } from "./projection"
import { MIN, T0, TripSim } from "./testSim"
import { depart } from "./transitions"

/** Trip branches (ADR 0222): layers, routes, outcomes, and choices on the trip flow. */

const ADA = { userId: "ada", name: "Ada" }

function branchMap(edit: (map: TripMapInput) => void = () => {}): TripMapInput {
  const map = structuredClone(SAMPLE_BRANCH_MAP)
  edit(map)
  return map
}

function start(map: TripMapInput = SAMPLE_BRANCH_MAP): TripSim {
  const sim = new TripSim(map)
  sim.apply(depart)
  return sim
}

/** Step until `done` holds (or the trip stops). */
function stepUntil(sim: TripSim, done: (sim: TripSim) => boolean, guard = 300): void {
  for (let i = 0; i < guard && !done(sim); i++) {
    if (!sim.stepNext() || sim.state.status !== "driving") return
  }
}

function logged(sim: TripSim, kind: string, phase?: string, name?: string): boolean {
  return sim.log.some(
    (e) =>
      e.kind === kind &&
      (phase === undefined || ("phase" in e && e.phase === phase)) &&
      (name === undefined || ("name" in e && e.name === name)),
  )
}

function storeSites(sim: TripSim): string[] {
  return buildTripStore(sim.state, sim.map, sim.current, sim.now).sites.map((s) => s.id)
}

function runToEnd(sim: TripSim): void {
  stepUntil(sim, () => sim.state.status !== "driving", 500)
}

describe("layers (ADR 0222)", () => {
  it("the Welcome Center unlocks its layer: the layer's site is revealed, polled, and visited", () => {
    const sim = start()
    sim.votes["hidden-falls"] = { stop: 2, skip: 0 }
    runToEnd(sim)
    expect(logged(sim, "layer", "unlocked", "Local tips")).toBe(true)
    expect(sim.state.sites["hidden-falls"]).toMatchObject({ phase: "visited", revealed: true })
    expect(
      sim.log.some((e) => e.kind === "incident" && e.incident === "busker" && e.step === "noted"),
    ).toBe(true)
    expect(sim.state.status).toBe("arrived")
  })

  it("locked content never shows, polls, or fires", () => {
    const sim = start(branchMap((map) => delete map.sites[0]!.onVisit))
    const seen = new Set<string>()
    stepUntil(sim, () => {
      storeSites(sim).forEach((id) => seen.add(id))
      return sim.state.status !== "driving"
    })
    expect(seen.has("hidden-falls")).toBe(false)
    expect(sim.state.sites["hidden-falls"]).toMatchObject({ phase: "ahead", revealed: false })
    expect(sim.state.scriptedFired).not.toContain("busker")
    expect(logged(sim, "incident", undefined, "Roadside busker")).toBe(false)
  })

  it("unlocking after the van passed layer content marks it missed, firing nothing", () => {
    const sim = start(branchMap((map) => delete map.sites[0]!.onVisit))
    stepUntil(sim, () => sim.mile() >= 11)
    expect(sim.apply(unlockNextLayer("local-map", ADA))).toBe(true)
    expect(sim.state.sites["hidden-falls"]!.phase).toBe("bypassed")
    expect(sim.state.scriptedFired).toContain("busker")
    expect(sim.thresholds().some((t) => t.payload.siteId === "hidden-falls")).toBe(false)
    runToEnd(sim)
    expect(logged(sim, "incident", undefined, "Roadside busker")).toBe(false)
    expect(storeSites(sim)).not.toContain("hidden-falls")
  })

  it("Local Map unlocks one layer per use, in authored order, and is refused when none are left", () => {
    const map = branchMap((m) => {
      delete m.sites[0]!.onVisit
      m.layers!.push({ id: "more-tips", name: "More tips", icon: "📍", unlockItems: ["local-map"] })
      m.sites[0]!.onVisit = [{ kind: "lock", layer: "more-tips" }]
    })
    const sim = start(map)
    expect(routeItemUse(sim.state, "local-map", sim.map, sim.now)).toEqual({
      kind: "unlock-layer",
      shortId: "local-map",
    })
    sim.apply(unlockNextLayer("local-map", ADA))
    expect(sim.state.layers["local-tips"]!.phase).toBe("unlocked")
    expect(sim.state.layers["more-tips"]!.phase).toBe("locked")
    sim.apply(unlockNextLayer("local-map", ADA))
    expect(sim.state.layers["more-tips"]!.phase).toBe("unlocked")
    expect(routeItemUse(sim.state, "local-map", sim.map, sim.now).kind).toBe("refused")
    expect(sim.apply(unlockNextLayer("local-map", ADA))).toBe(false)
  })

  it("Trip Guide names the non-secret stops ahead and is refused once there's nothing new", () => {
    const sim = start()
    expect(routeItemUse(sim.state, "trip-guide", sim.map, sim.now).kind).toBe("reveal-ahead")
    expect(sim.apply(revealAhead("trip-guide", ADA))).toBe(true)
    // Diner is on the path and `secret: false`; the Gas Stop is secret until revealed;
    // Hidden Falls is in a locked layer; the Overlook is on a fork nobody has taken.
    expect(sim.state.sites["diner"]!.revealed).toBe(true)
    expect(sim.state.sites["gas-stop"]!.revealed).toBe(false)
    expect(sim.state.sites["hidden-falls"]!.revealed).toBe(false)
    expect(sim.state.sites["overlook"]!.revealed).toBe(false)
    expect(routeItemUse(sim.state, "trip-guide", sim.map, sim.now).kind).toBe("refused")
  })

  it("locking cancels an open vote on the layer's content; a decided stop still parks", () => {
    const lockAt = (mile: number) =>
      branchMap((map) => {
        map.events!.push({
          id: "closed-sign",
          name: "Closed sign",
          icon: "🚫",
          mile,
          outcomes: [{ kind: "lock", layer: "local-tips" }],
        })
      })
    const open = start(lockAt(7))
    stepUntil(open, () => open.state.sites["hidden-falls"]!.phase === "polling")
    const pollId = open.state.sites["hidden-falls"]!.vote!.pollId
    stepUntil(open, () => logged(open, "layer", "locked"))
    expect(open.state.sites["hidden-falls"]!.phase).toBe("ahead")
    expect(
      open.effects.some(({ effect }) => effect.type === "close-poll" && effect.pollId === pollId),
    ).toBe(true)
    runToEnd(open)
    expect(open.state.sites["hidden-falls"]!.visitedAt).toBeUndefined()

    const decided = start(lockAt(7.5))
    decided.votes["hidden-falls"] = { stop: 3, skip: 0 }
    stepUntil(decided, () => logged(decided, "layer", "locked"))
    expect(decided.state.sites["hidden-falls"]!.phase).toBe("stopping")
    runToEnd(decided)
    expect(decided.state.sites["hidden-falls"]!.phase).toBe("visited")
  })
})

describe("routes and junctions (ADR 0222)", () => {
  it("a 'take' vote turns at the fork, bypasses the parent stretch, and rejoins", () => {
    const sim = start()
    sim.tallies["junction:scenic-byway"] = [3, 1]
    stepUntil(sim, () => sim.state.junctions["scenic-byway"]!.phase === "take")
    // ETA and fuel follow the decided path at once.
    expect(sim.state.routeMiles).toBe(27)
    runToEnd(sim)
    expect(sim.state.path.map((leg) => leg.route)).toEqual(["main", "scenic-byway", "main"])
    expect(sim.state.junctions["scenic-byway"]!.phase).toBe("taken")
    expect(sim.state.sites["diner"]!.phase).toBe("bypassed")
    expect(sim.state.sites["overlook"]!.revealed).toBe(true)
    expect(storeSites(sim)).not.toContain("diner")
    expect(sim.state.status).toBe("arrived")
  })

  it("a 'stay' vote passes the fork, and the route's content never shows", () => {
    const sim = start()
    sim.tallies["junction:scenic-byway"] = [0, 2]
    const seen = new Set<string>()
    stepUntil(sim, () => {
      storeSites(sim).forEach((id) => seen.add(id))
      return sim.state.status !== "driving"
    })
    expect(sim.state.junctions["scenic-byway"]!.phase).toBe("passed")
    expect(seen.has("overlook")).toBe(false)
    expect(sim.state.routeMiles).toBe(30)
    expect(sim.state.sites["diner"]!.phase).not.toBe("bypassed")
  })

  it("an undecided default-'take' fork shows nothing of its route before the vote resolves", () => {
    const sim = start(
      branchMap((map) => {
        const byway = map.routes![0]!
        if (byway.entry.kind === "vote") byway.entry.default = "take"
      }),
    )
    stepUntil(sim, () => sim.state.junctions["scenic-byway"]!.phase === "polling")
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.map((s) => s.id)).not.toContain("overlook")
    expect(store.routeMiles).toBe(30)
    expect(store.junctions).toEqual([
      expect.objectContaining({ routeId: "scenic-byway", state: "polling", name: "Scenic Byway" }),
    ])
    // No votes: the default takes it.
    stepUntil(sim, () => sim.state.junctions["scenic-byway"]!.phase !== "polling")
    expect(sim.state.junctions["scenic-byway"]).toMatchObject({ phase: "take", defaulted: true })
  })

  it("a route that returns to its fork, and one that ends at its own destination", () => {
    const loop = start(
      branchMap((map) => {
        map.routes![0] = { ...map.routes![0]!, end: { kind: "rejoin", mile: 14 }, driveMinutes: 3 }
      }),
    )
    loop.tallies["junction:scenic-byway"] = [1, 0]
    runToEnd(loop)
    expect(loop.state.path.map((l) => [l.route, l.fromMile])).toEqual([
      ["main", 0],
      ["scenic-byway", 0],
      ["main", 14],
    ])
    expect(loop.state.sites["diner"]!.phase).not.toBe("bypassed")
    expect(loop.state.routeMiles).toBe(33)

    const away = start(
      branchMap((map) => {
        map.routes![0] = { ...map.routes![0]!, end: { kind: "destination" }, driveMinutes: 6 }
        map.sites.push({
          id: "lake",
          name: "Lakeside Stage",
          description: "Plan B.",
          icon: "🏕️",
          mile: 6,
          route: "scenic-byway",
          role: "destination",
        })
      }),
    )
    away.tallies["junction:scenic-byway"] = [1, 0]
    runToEnd(away)
    expect(away.state.status).toBe("arrived")
    expect(away.state.sites["lake"]!.phase).toBe("visited")
    expect(away.state.sites["arena"]!.phase).not.toBe("visited")
    expect(away.state.routeMiles).toBe(20)
  })

  it("a tow during an open junction vote settles it from the tally and tows along that path", () => {
    const sim = start(
      branchMap((map) => {
        map.sites.find((s) => s.id === "overlook")!.services = { mechanic: true }
        map.events!.push({
          id: "smoke",
          name: "Engine failure",
          icon: "🔧",
          mile: 13.1,
          effect: { kind: "stop" },
          resolution: [{ kind: "tow" }],
        })
      }),
    )
    sim.tallies["junction:scenic-byway"] = [4, 0]
    stepUntil(sim, () => sim.state.incident?.incident === "smoke")
    expect(sim.state.junctions["scenic-byway"]).toMatchObject({ phase: "take", votes: [4, 0] })
    expect(sim.state.incident!.steps.some((s) => s.kind === "tow" && s.siteId === "overlook")).toBe(
      true,
    )
    stepUntil(sim, () => sim.state.sites["overlook"]!.phase === "parked")
    expect(sim.state.junctions["scenic-byway"]!.phase).toBe("taken")
    expect(sim.state.path.at(-1)!.route).toBe("scenic-byway")
  })

  it("a tow carries the van across a rejoin", () => {
    const sim = start(
      branchMap((map) => {
        map.sites.push({
          id: "garage",
          name: "Hank's Garage",
          description: "Open late.",
          icon: "🔧",
          mile: 24.5,
          services: { mechanic: true },
        })
        map.events!.push({
          id: "smoke",
          name: "Engine failure",
          icon: "🔧",
          mile: 1,
          route: "scenic-byway",
          effect: { kind: "stop" },
          resolution: [{ kind: "tow" }],
        })
      }),
    )
    sim.tallies["junction:scenic-byway"] = [2, 0]
    stepUntil(sim, () => sim.state.sites["garage"]!.phase === "parked")
    expect(sim.state.path.map((l) => l.route)).toEqual(["main", "scenic-byway", "main"])
    expect(sim.state.sites["diner"]!.phase).toBe("bypassed")
    expect(logged(sim, "junction", "rejoined")).toBe(true)
  })
})

describe("event choices (ADR 0222)", () => {
  it("a stop choice holds the van until its vote closes; a tie takes the default", () => {
    const sim = start()
    sim.tallies["junction:scenic-byway"] = [0, 1]
    stepUntil(sim, () => sim.state.incident?.incident === "road-closed")
    expect(sim.current.mph).toBe(0)
    expect(sim.polls.map((p) => p.target.kind)).toEqual(["choice"])
    const key = `choice:${sim.state.incident!.id}:0`
    sim.tallies[key] = [2, 2]
    stepUntil(sim, () => logged(sim, "choice"))
    expect(sim.log.find((e) => e.kind === "choice")).toMatchObject({
      winner: "wait",
      defaulted: true,
    })
    expect(sim.state.junctions["detour"]!.phase).toBe("ahead")
  })

  it("a divert option takes the fork ahead; a host skip closes the vote with the tally", () => {
    const sim = start()
    sim.tallies["junction:scenic-byway"] = [0, 1]
    stepUntil(sim, () => sim.state.incident?.incident === "road-closed")
    sim.tallies[`choice:${sim.state.incident!.id}:0`] = [3, 0]
    expect(sim.apply(skipIncidentStep)).toBe(true)
    expect(sim.log.find((e) => e.kind === "choice")).toMatchObject({
      winner: "detour",
      defaulted: false,
    })
    expect(sim.state.junctions["detour"]!.phase).toBe("take")
    expect(sim.state.routeMiles).toBe(32)
    runToEnd(sim)
    expect(sim.state.path.map((l) => l.route)).toEqual(["main", "detour", "main"])
  })

  it("a slowdown hosting a choice crawls until both its time and the vote are done", () => {
    const sim = start(
      branchMap((map) => {
        map.events!.push({
          id: "parade",
          name: "Parade",
          icon: "🎉",
          mile: 5,
          effect: { kind: "slow", factor: 0.5 },
          durationMinutes: 0.25,
          resolution: [
            {
              kind: "choice",
              question: "Join the parade?",
              seconds: 40,
              default: "no",
              options: [
                { id: "yes", label: "Join in", outcomes: [] },
                { id: "no", label: "Wave", outcomes: [] },
              ],
            },
          ],
        })
      }),
    )
    stepUntil(sim, () => sim.state.incident?.incident === "parade")
    const started = sim.now
    sim.runUntil(started + 20_000)
    // The slowdown's 15 s are up, but the vote is still open: still crawling.
    expect(sim.state.incident?.incident).toBe("parade")
    expect(sim.current.mph).toBe(30)
    stepUntil(sim, () => !sim.state.incident)
    expect(sim.now).toBeGreaterThanOrEqual(started + 40_000)
    expect(logged(sim, "choice")).toBe(true)
  })

  it("a narrative-only choice keeps the van driving but holds the incident slot", () => {
    const sim = start(
      branchMap((map) => {
        map.events!.push({
          id: "hitch",
          name: "Hitchhiker",
          icon: "👍",
          mile: 5,
          resolution: [
            {
              kind: "choice",
              question: "Pick them up?",
              seconds: 30,
              default: "no",
              options: [
                { id: "yes", label: "Sure", outcomes: [] },
                { id: "no", label: "Not today", outcomes: [] },
              ],
            },
          ],
        })
      }),
    )
    stepUntil(sim, () => sim.state.incident?.incident === "hitch")
    expect(sim.current.mph).toBe(60)
    expect(sim.apply(triggerIncident("traffic-jam"))).toBe(true)
    expect(sim.state.incidentQueue.map((q) => q.incident)).toEqual(["traffic-jam"])
    stepUntil(sim, () => sim.state.incident?.incident === "traffic-jam")
    expect(logged(sim, "choice")).toBe(true)
  })

  it("a busy room retries the choice's poll, then falls back to the default", () => {
    const sim = start()
    sim.tallies["junction:scenic-byway"] = [0, 1]
    stepUntil(sim, () => sim.state.junctions["scenic-byway"]!.phase === "passed")
    sim.pollBusy = true
    stepUntil(sim, () => logged(sim, "choice"))
    expect(sim.polls).toEqual([])
    expect(sim.log.find((e) => e.kind === "choice")).toMatchObject({
      winner: "wait",
      defaulted: true,
    })
  })
})

describe("flow guards", () => {
  it("ignores a divert to a fork behind the van", () => {
    const sim = start()
    sim.tallies["junction:scenic-byway"] = [0, 1]
    stepUntil(sim, () => sim.state.junctions["scenic-byway"]!.phase === "passed")
    const ctx = contextFor(sim.state, sim.map, sim.now)
    expect(
      dispatch({ type: "DIVERT", routeId: "scenic-byway", by: { kind: "event", id: "x" } })(
        sim.state,
        ctx,
      ),
    ).toBeNull()
  })

  it("starts with every layer locked and every fork ahead", () => {
    const sim = new TripSim(SAMPLE_BRANCH_MAP, T0)
    expect(sim.state.layers).toEqual({ "local-tips": { phase: "locked" } })
    expect(sim.state.junctions).toEqual({
      "scenic-byway": { phase: "ahead" },
      detour: { phase: "ahead" },
    })
    expect(sim.state.routeMiles).toBe(30)
    expect(MIN).toBe(60_000)
  })
})
