import { describe, expect, it, vi } from "vitest"
import { SAMPLE_BRANCH_MAP, type TripMapInput } from "@repo/road-trip-map"
import { routeItemUse } from "../items"
import { contextFor } from "./commit"
import { dispatch } from "./flow"
import { openTripMap, revealAhead } from "./guide"
import { skipIncidentStep, triggerIncident } from "./incidents"
import { buildTripStore } from "./projection"
import { normalizeTripState, type TripState } from "./state"
import { MIN, T0, TripSim } from "./testSim"
import { depart, endTrip } from "./transitions"

/** Trip branches (ADR 0222): layers, routes, outcomes, and choices on the trip flow. */

const ADA = { userId: "ada", name: "Ada" }
const LOCAL_MAP = "map-local"

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

  it("onDepart unlocks when the van leaves, and not while it is still parked", () => {
    const sim = start(
      branchMap((map) => {
        const welcome = map.sites[0]!
        welcome.onDepart = welcome.onVisit
        delete welcome.onVisit
      }),
    )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(sim.state.sites["welcome-center"]?.phase).toBe("parked")
    expect(sim.state.layers["local-tips"]?.phase).toBe("locked")
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "visited")
    expect(sim.state.layers["local-tips"]?.phase).toBe("unlocked")
    sim.votes["hidden-falls"] = { stop: 2, skip: 0 }
    runToEnd(sim)
    expect(sim.state.sites["hidden-falls"]).toMatchObject({ phase: "visited", revealed: true })
  })

  it("posts the departure narrative on leave, before the onDepart unlock sign", () => {
    const sim = start(
      branchMap((map) => {
        const welcome = map.sites[0]!
        welcome.narrative = "The clerk waves hello."
        welcome.departNarrative = "Before you leave, the clerk leans in close."
        welcome.departNarrativeVariant = "info"
        welcome.onDepart = welcome.onVisit
        delete welcome.onVisit
      }),
    )
    const bodies = () =>
      sim.effects.flatMap(({ effect }) =>
        effect.type === "narrate" ? [effect.body] : effect.type === "sign" ? [effect.title] : [],
      )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(bodies()).toContain("The clerk waves hello.")
    expect(bodies()).not.toContain("Before you leave, the clerk leans in close.")
    expect(sim.state.sites["welcome-center"]?.leftAt).toBeUndefined()
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "visited")
    const after = bodies()
    const prose = after.indexOf("Before you leave, the clerk leans in close.")
    expect(prose).toBeGreaterThan(-1)
    expect(after.indexOf("Local tips")).toBeGreaterThan(prose)
    expect(
      sim.effects.find(
        ({ effect }) => effect.type === "narrate" && effect.body.startsWith("Before you leave"),
      )?.effect,
    ).toMatchObject({ variant: "info" })
    expect(sim.state.sites["welcome-center"]?.leftAt).toBe(sim.now)
  })

  it("the store sends the departure narrative only once the van has left", () => {
    const sim = start(
      branchMap((map) => {
        map.sites[0]!.narrative = "The clerk waves hello."
        map.sites[0]!.departNarrative = "Before you leave, the clerk leans in close."
      }),
    )
    const welcome = () =>
      buildTripStore(sim.state, sim.map, sim.current, sim.now).sites.find(
        (s) => s.id === "welcome-center",
      )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(welcome()).toMatchObject({ narrative: "The clerk waves hello." })
    expect(welcome()?.departNarrative).toBeUndefined()
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "visited")
    expect(welcome()).toMatchObject({
      narrative: "The clerk waves hello.",
      departNarrative: "Before you leave, the clerk leans in close.",
    })
  })

  it("arriving at the destination posts its visit narrative only", () => {
    const sim = start(
      branchMap((map) => {
        const destination = map.sites.find((s) => s.role === "destination")!
        destination.narrative = "Made it."
        destination.departNarrative = "Never posted."
      }),
    )
    runToEnd(sim)
    const prose = sim.effects.flatMap(({ effect }) => (effect.type === "narrate" ? [effect.body] : []))
    expect(prose).toContain("Made it.")
    expect(prose).not.toContain("Never posted.")
  })

  it("ending the trip while parked posts no departure narrative", () => {
    const sim = start(
      branchMap((map) => {
        map.sites[0]!.departNarrative = "Before you leave, the clerk leans in close."
      }),
    )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(sim.apply(endTrip)).toBe(true)
    expect(
      sim.effects.some(({ effect }) => effect.type === "narrate" && effect.body.startsWith("Before")),
    ).toBe(false)
    expect(sim.state.sites["welcome-center"]?.leftAt).toBeUndefined()
  })

  it("queues site departure sounds on leave, not when ending while parked", () => {
    const leave = "https://cdn.listeningroom.club/assets/maps/sounds/leave.mp3"
    const sim = start(
      branchMap((map) => {
        map.sites[0]!.narrativeSounds = [{ trigger: "departure", url: leave }]
      }),
    )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(sim.effects.some(({ effect }) => effect.type === "sound")).toBe(false)
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "visited")
    expect(sim.effects.map(({ effect }) => effect)).toContainEqual({ type: "sound", url: leave })

    const parked = start(
      branchMap((map) => {
        map.sites[0]!.narrativeSounds = [{ trigger: "departure", url: leave }]
      }),
    )
    stepUntil(parked, () => parked.state.sites["welcome-center"]?.phase === "parked")
    parked.effects = []
    expect(parked.apply(endTrip)).toBe(true)
    expect(parked.effects.some(({ effect }) => effect.type === "sound" && effect.url === leave)).toBe(
      false,
    )
  })

  it("ending the trip while parked does not apply onDepart", () => {
    const sim = start(
      branchMap((map) => {
        const welcome = map.sites[0]!
        welcome.onDepart = welcome.onVisit
        delete welcome.onVisit
      }),
    )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(sim.apply(endTrip)).toBe(true)
    expect(sim.state.status).toBe("stranded")
    expect(sim.state.layers["local-tips"]?.phase).toBe("locked")
    expect(logged(sim, "layer", "unlocked", "Local tips")).toBe(false)
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
    expect(sim.apply(openTripMap(LOCAL_MAP, ADA))).toBe(true)
    expect(sim.state.sites["hidden-falls"]!.phase).toBe("bypassed")
    expect(sim.state.scriptedFired).toContain("busker")
    expect(sim.thresholds().some((t) => t.payload.siteId === "hidden-falls")).toBe(false)
    runToEnd(sim)
    expect(logged(sim, "incident", undefined, "Roadside busker")).toBe(false)
    expect(storeSites(sim)).not.toContain("hidden-falls")
  })
})

describe("trip maps (ADR 0227)", () => {
  it("one use unlocks every opted-in locked layer, and a second use is refused", () => {
    const map = branchMap((m) => {
      delete m.sites[0]!.onVisit
      m.layers!.push({ id: "more-tips", name: "More tips", icon: "📍", maps: ["local"] })
      m.layers!.push({ id: "elsewhere", name: "Elsewhere", icon: "🧭" })
    })
    const sim = start(map)
    expect(routeItemUse(sim.state, LOCAL_MAP, sim.map, sim.now)).toEqual({
      kind: "unlock-layers",
      shortId: LOCAL_MAP,
    })
    expect(sim.apply(openTripMap(LOCAL_MAP, ADA))).toBe(true)
    expect(sim.state.layers["local-tips"]!.phase).toBe("unlocked")
    expect(sim.state.layers["more-tips"]!.phase).toBe("unlocked")
    expect(sim.state.layers["elsewhere"]!.phase).toBe("locked")
    expect(sim.signs()).toContain("Local tips")
    expect(routeItemUse(sim.state, LOCAL_MAP, sim.map, sim.now)).toEqual({
      kind: "refused",
      message: "This map has nothing more to show you.",
    })
    expect(sim.apply(openTripMap(LOCAL_MAP, ADA))).toBe(false)
  })

  it("skips a layer a site already unlocked and opens the rest", () => {
    const map = branchMap((m) => {
      m.layers!.push({ id: "more-tips", name: "More tips", icon: "📍", maps: ["local"] })
    })
    const sim = start(map)
    stepUntil(sim, () => sim.state.layers["local-tips"]?.phase === "unlocked")
    expect(sim.state.layers["more-tips"]!.phase).toBe("locked")
    const before = sim.log.filter((e) => e.kind === "layer").length
    expect(sim.apply(openTripMap(LOCAL_MAP, ADA))).toBe(true)
    expect(sim.state.layers["more-tips"]!.phase).toBe("unlocked")
    expect(sim.log.filter((e) => e.kind === "layer").length).toBe(before + 1)
  })

  it("opens a layer whose unlocking site the van passed: stops ahead appear, stops behind are missed", () => {
    const sim = start(branchMap((m) => delete m.sites[0]!.onVisit))
    sim.votes["gas-stop"] = { stop: 2, skip: 0 }
    stepUntil(sim, () => sim.state.sites["gas-stop"]?.phase === "parked")
    expect(sim.state.sites["gas-stop"]!.phase).toBe("parked")
    expect(sim.state.layers["local-tips"]!.phase).toBe("locked")
    expect(storeSites(sim)).not.toContain("swimming-hole")
    expect(sim.apply(openTripMap(LOCAL_MAP, ADA))).toBe(true)
    expect(sim.state.sites["hidden-falls"]!.phase).toBe("bypassed")
    expect(sim.state.sites["swimming-hole"]!.phase).toBe("ahead")
    sim.votes["swimming-hole"] = { stop: 2, skip: 0 }
    runToEnd(sim)
    expect(sim.state.sites["swimming-hole"]).toMatchObject({ phase: "visited", revealed: true })
  })

  it("refuses a map the loaded trip doesn't define, and outside a trip", () => {
    const sim = start()
    expect(routeItemUse(sim.state, "map-elsewhere", sim.map, sim.now)).toEqual({
      kind: "refused",
      message: "This map is for a different trip.",
    })
    expect(routeItemUse(null, LOCAL_MAP, sim.map, sim.now).kind).toBe("refused")
  })
})

describe("trip guide and layer locks (ADR 0222)", () => {

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

  it("puts a shortcut's question on the exit poll", () => {
    const sim = start(
      branchMap((map) => {
        const byway = map.routes![0]!
        if (byway.entry.kind === "vote") byway.entry.question = "Cut through the canyon?"
      }),
    )
    stepUntil(sim, () => sim.state.junctions["scenic-byway"]!.phase === "polling")
    expect(sim.polls[0]).toMatchObject({
      question: "Cut through the canyon?",
      presentation: {
        eyebrow: "JUNCTION",
        headline: "SCENIC BYWAY",
        body: "Cut through the canyon?",
      },
    })
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
    expect(sim.polls[0]?.presentation?.body).toBeUndefined()
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
    expect(sim.polls[0]?.presentation?.body).toBe("Join the parade?")
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
    expect(sim.state.layers).toEqual({
      "local-tips": { phase: "locked" },
      ridge: { phase: "locked" },
    })
    expect(sim.state.junctions).toEqual({
      "scenic-byway": { phase: "ahead" },
      detour: { phase: "ahead" },
    })
    expect(sim.state.routeMiles).toBe(30)
    expect(MIN).toBe(60_000)
  })
})

describe("key items and conditions (ADR 0230)", () => {
  const PASS = "trail-pass"
  const FOUND = /tears off a trail pass/
  const CASE = /lifeguard spots the trail pass/
  const FALLBACK = "The water's cold. Nobody admits it."

  function bodies(sim: TripSim): string[] {
    return sim.effects.flatMap(({ effect }) =>
      effect.type === "narrate" ? [effect.body] : effect.type === "sign" ? [effect.title] : [],
    )
  }

  /** Stop at Hidden Falls (it gives the Trail Pass on departure) and at the Swimming Hole. */
  function toSwimmingHole(sim: TripSim, stopAtFalls: boolean): void {
    sim.votes["hidden-falls"] = stopAtFalls ? { stop: 2, skip: 0 } : { stop: 0, skip: 2 }
    sim.votes["swimming-hole"] = { stop: 2, skip: 0 }
    stepUntil(sim, () => sim.state.sites["swimming-hole"]?.phase === "parked")
    expect(sim.state.sites["swimming-hole"]?.phase).toBe("parked")
  }

  it("leaving Hidden Falls puts the key in the van: depart narrative, found narrative, Back on the road", () => {
    const sim = start(
      branchMap((map) => {
        map.sites.find((s) => s.id === "hidden-falls")!.departNarrative = "Mist on the windshield."
      }),
    )
    sim.votes["hidden-falls"] = { stop: 2, skip: 0 }
    stepUntil(sim, () => sim.state.sites["hidden-falls"]?.phase === "parked")
    expect(sim.state.keyItems).toEqual({})
    stepUntil(sim, () => sim.state.sites["hidden-falls"]?.phase === "visited")
    expect(sim.state.keyItems[PASS]).toEqual({
      at: sim.now,
      by: { kind: "site", id: "hidden-falls" },
    })
    const lines = bodies(sim)
    const depart = lines.indexOf("Mist on the windshield.")
    const found = lines.findIndex((line) => FOUND.test(line))
    const back = lines.lastIndexOf("Back on the road")
    expect(depart).toBeGreaterThanOrEqual(0)
    expect(found).toBe(depart + 1)
    expect(back).toBe(found + 1)

    // The Van tab lists it with its giver.
    const sheet = buildTripStore(sim.state, sim.map, sim.current, sim.now).vanSheet
    expect(sheet.keyItems).toEqual([
      {
        id: PASS,
        name: "Trail Pass",
        icon: "🎟️",
        description: "A ranger's pass from Hidden Falls.",
        givenBy: "Hidden Falls",
        at: sim.now,
      },
    ])
  })

  it("arriving with the key posts the matching narrative case and unlocks the layer", () => {
    const sim = start()
    toSwimmingHole(sim, true)
    const lines = bodies(sim)
    expect(lines.some((line) => CASE.test(line))).toBe(true)
    expect(lines).not.toContain(FALLBACK)
    expect(sim.state.layers.ridge?.phase).toBe("unlocked")
    expect(sim.state.sites["swimming-hole"]?.narrativeCase).toBe(0)
    expect(sim.given).toEqual([])
    // The Trip tab replays the case that posted, not the plain narrative.
    const store = buildTripStore(sim.state, sim.map, sim.current, sim.now)
    expect(store.sites.find((s) => s.id === "swimming-hole")?.narrative).toMatch(CASE)
    expect(store.sites.map((s) => s.id)).toContain("ridge-lookout")
  })

  it("arriving without the key posts the fallback, leaves the layer locked, and hands one traveler a Trip Guide", () => {
    const sim = start()
    toSwimmingHole(sim, false)
    expect(sim.state.keyItems).toEqual({})
    const lines = bodies(sim)
    expect(lines).toContain(FALLBACK)
    expect(lines.some((line) => CASE.test(line))).toBe(false)
    expect(sim.state.layers.ridge?.phase).toBe("locked")
    expect(sim.state.sites["swimming-hole"]?.narrativeCase).toBeUndefined()
    expect(sim.given).toHaveLength(1)
    expect(sim.given[0]).toMatchObject({ item: "road-trip:trip-guide", qty: 1 })
    expect(["ada", "bo", "cy"]).toContain(sim.given[0]!.userId)
    expect(buildTripStore(sim.state, sim.map, sim.current, sim.now).vanSheet.keyItems).toBeUndefined()
  })

  it("give-item to everyone calls giveItem once per online traveler; random calls it once", () => {
    const everyone = start(
      branchMap((map) => {
        map.sites.find((s) => s.id === "welcome-center")!.onVisit!.push({
          kind: "give-item",
          item: "road-trip:fix-a-flat",
          to: "everyone",
          qty: 2,
        })
      }),
    )
    const giveItem = vi.fn()
    everyone.giveItem = giveItem
    everyone.online = ["ada", "bo"]
    stepUntil(everyone, () => everyone.state.sites["welcome-center"]?.phase === "parked")
    expect(giveItem.mock.calls).toEqual([
      ["ada", "road-trip:fix-a-flat", 2],
      ["bo", "road-trip:fix-a-flat", 2],
    ])

    const random = start(
      branchMap((map) => {
        map.sites.find((s) => s.id === "welcome-center")!.onVisit!.push({
          kind: "give-item",
          item: "road-trip:fix-a-flat",
          to: "random",
        })
      }),
    )
    const once = vi.fn()
    random.giveItem = once
    stepUntil(random, () => random.state.sites["welcome-center"]?.phase === "parked")
    expect(once).toHaveBeenCalledTimes(1)
    expect(once.mock.calls[0]![2]).toBe(1)
  })

  it("take-key removes the key from the van", () => {
    const sim = start(
      branchMap((map) => {
        map.sites.find((s) => s.id === "gas-stop")!.onVisit = [{ kind: "take-key", key: PASS }]
      }),
    )
    sim.votes["hidden-falls"] = { stop: 2, skip: 0 }
    sim.votes["gas-stop"] = { stop: 2, skip: 0 }
    stepUntil(sim, () => sim.state.sites["hidden-falls"]?.phase === "visited")
    expect(sim.state.keyItems[PASS]).toBeDefined()
    stepUntil(sim, () => sim.state.sites["gas-stop"]?.phase === "parked")
    expect(sim.state.keyItems).toEqual({})
  })

  it("giving a key the van already holds changes nothing and posts no second narrative", () => {
    const sim = start()
    expect(sim.setKeyItem(PASS, true)).toBe(true)
    expect(bodies(sim).filter((line) => FOUND.test(line))).toHaveLength(1)
    const held = sim.state.keyItems[PASS]
    expect(held?.by).toEqual({ kind: "host" })
    sim.votes["hidden-falls"] = { stop: 2, skip: 0 }
    stepUntil(sim, () => sim.state.sites["hidden-falls"]?.phase === "visited")
    expect(sim.state.sites["hidden-falls"]?.phase).toBe("visited")
    expect(sim.state.keyItems[PASS]).toEqual(held)
    expect(bodies(sim).filter((line) => FOUND.test(line))).toHaveLength(1)
    expect(sim.setKeyItem(PASS, true)).toBe(false)
  })

  it("checks every when against the trip as the outcome list started (snapshot)", () => {
    const sim = start(
      branchMap((map) => {
        map.sites.find((s) => s.id === "welcome-center")!.onVisit = [
          { kind: "give-key", key: PASS, narrative: "The clerk hands over a pass." },
          { kind: "unlock", layer: "local-tips", when: { has: PASS } },
        ]
      }),
    )
    stepUntil(sim, () => sim.state.sites["welcome-center"]?.phase === "parked")
    expect(sim.state.keyItems[PASS]).toBeDefined()
    expect(sim.state.layers["local-tips"]?.phase).toBe("locked")
    // The outcome's own narrative replaces the key's found narrative.
    const lines = bodies(sim)
    expect(lines).toContain("The clerk hands over a pass.")
    expect(lines.some((line) => FOUND.test(line))).toBe(false)
  })

  it("a departure narrative case is checked before onDepart runs", () => {
    const sim = start(
      branchMap((map) => {
        const falls = map.sites.find((s) => s.id === "hidden-falls")!
        falls.departNarrative = "Back to the van."
        falls.departNarrativeCases = [{ when: { has: PASS }, text: "Pass already on the visor." }]
      }),
    )
    sim.votes["hidden-falls"] = { stop: 2, skip: 0 }
    stepUntil(sim, () => sim.state.sites["hidden-falls"]?.phase === "visited")
    const lines = bodies(sim)
    expect(lines).toContain("Back to the van.")
    expect(lines).not.toContain("Pass already on the visor.")
    expect(sim.state.sites["hidden-falls"]?.departNarrativeCase).toBeUndefined()
  })

  it("a trip state saved before key items reads with an empty van", () => {
    const sim = new TripSim(SAMPLE_BRANCH_MAP, T0)
    const { keyItems: _none, ...saved } = sim.state
    const normalized = normalizeTripState(saved as TripState)
    expect(normalized.keyItems).toEqual({})
    expect(normalizeTripState(sim.state)).toBe(sim.state)
  })
})
