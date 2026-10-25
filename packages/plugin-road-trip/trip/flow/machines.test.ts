import { describe, expect, it } from "vitest"
import { SAMPLE_TRIP_MAP } from "@repo/road-trip-map"
import { contextFor } from "../commit"
import { TripSim } from "../testSim"
import { flow, FlowOverflowError, MAX_FLOW_EVENTS, type TripFlowEvent } from "./index"
import {
  defineMachine,
  moves,
  reachableStates,
  send,
  toMermaid,
  type MachineDef,
  type MachineEvent,
} from "./machine"
import { siteMachine, TRIP_MACHINES, voteMachine } from "./machines"

describe("flow engine (ADR 0222)", () => {
  it("sends legal moves and ignores illegal ones", () => {
    expect(send(siteMachine, "ahead", { type: "POLL_OPENED" })).toBe("polling")
    expect(send(siteMachine, "visited", { type: "PARK" })).toBeNull()
    expect(send(voteMachine, "decided", { type: "OPEN" })).toBeNull()
    expect(send(voteMachine, "pending", { type: "DEFER" })).toBe("pending")
  })

  it("rejects tables that target unknown states", () => {
    expect(() =>
      defineMachine<"a" | "b", { type: "GO" }>({
        id: "broken",
        initial: "a",
        // @ts-expect-error a move to a state the table doesn't list
        states: { a: { on: { GO: "c" } }, b: {} },
      }),
    ).toThrow(/unknown state/)
  })

  it.each(
    TRIP_MACHINES.map(
      (def) => [def.id, def as unknown as MachineDef<string, MachineEvent>] as const,
    ),
  )("%s: every state is reachable and every move is documented", (_id, def) => {
    expect(Array.from(reachableStates(def)).sort()).toEqual(Object.keys(def.states).sort())
    const documented = def.events ?? {}
    for (const [, type] of moves(def)) expect(documented).toHaveProperty(type)
    expect(toMermaid(def)).toContain(`[*] --> ${def.initial}`)
  })

  it("caps one dispatch's events, so an outcome cycle aborts the write", () => {
    const sim = new TripSim(SAMPLE_TRIP_MAP)
    const ctx = contextFor(sim.state, sim.map, sim.now)
    const many: TripFlowEvent[] = Array.from({ length: MAX_FLOW_EVENTS + 1 }, () => ({
      type: "SITE_REVEAL",
      siteId: "record-store",
    }))
    expect(() => flow({ next: sim.state, log: [], effects: [] }, ctx, ...many)).toThrow(
      FlowOverflowError,
    )
  })
})
