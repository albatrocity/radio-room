import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"
import { roadTripVanMotionMachine, VAN_FLOURISH_MS } from "./roadTripVanMotionMachine"

function start(animationsEnabled = true) {
  return createActor(roadTripVanMotionMachine, { input: { animationsEnabled } }).start()
}

const phaseOf = (actor: ReturnType<typeof start>) =>
  (actor.getSnapshot().value as { phase: string }).phase

describe("roadTripVanMotionMachine", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("snaps on the first sync", () => {
    const actor = start()
    actor.send({ type: "SYNC", phase: "parked" })
    expect(phaseOf(actor)).toBe("parked")
    expect(actor.getSnapshot().context.flourish).toBeNull()
  })

  it("plays depart when leaving a stop, then clears", () => {
    const actor = start()
    actor.send({ type: "SYNC", phase: "parked" })
    actor.send({ type: "SYNC", phase: "cruising" })
    expect(actor.getSnapshot().context).toMatchObject({ flourish: "depart", flourishId: 1 })
    vi.advanceTimersByTime(VAN_FLOURISH_MS.depart)
    expect(actor.getSnapshot().context.flourish).toBeNull()
  })

  it("rubber-bands into parked and shortens it for a hold", () => {
    const actor = start()
    actor.send({ type: "SYNC", phase: "exiting" })
    actor.send({ type: "SYNC", phase: "parked" })
    expect(actor.getSnapshot().context.flourish).toBe("park")

    actor.send({ type: "SYNC", phase: "cruising" })
    actor.send({ type: "SYNC", phase: "held" })
    expect(actor.getSnapshot().context).toMatchObject({ flourish: "hold", flourishId: 3 })
  })

  it("changes the word only from cruising to exiting", () => {
    const actor = start()
    actor.send({ type: "SYNC", phase: "cruising" })
    actor.send({ type: "SYNC", phase: "exiting" })
    expect(phaseOf(actor)).toBe("exiting")
    expect(actor.getSnapshot().context.flourishId).toBe(0)
  })

  it("ignores a repeated phase", () => {
    const actor = start()
    actor.send({ type: "SYNC", phase: "held" })
    actor.send({ type: "SYNC", phase: "cruising" })
    actor.send({ type: "SYNC", phase: "cruising" })
    expect(actor.getSnapshot().context.flourishId).toBe(1)
  })

  it("snaps every edge with reduced motion", () => {
    const actor = start(false)
    actor.send({ type: "SYNC", phase: "cruising" })
    actor.send({ type: "SYNC", phase: "parked" })
    expect(phaseOf(actor)).toBe("parked")
    expect(actor.getSnapshot().context.flourish).toBeNull()
  })
})
