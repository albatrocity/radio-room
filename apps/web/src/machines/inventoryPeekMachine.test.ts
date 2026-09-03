import { describe, expect, it } from "vitest"
import { createActor } from "xstate"
import { inventoryPeekMachine } from "./inventoryPeekMachine"

const row = {
  itemId: "i1",
  definitionId: "d1",
  quantity: 1,
  name: "Black Bag",
  shortId: "black-bag",
  tradeable: true,
  slotPool: "inventory" as const,
}

function start() {
  const actor = createActor(inventoryPeekMachine).start()
  return actor
}

describe("inventoryPeekMachine", () => {
  it("moves idle → loading on PEEK and records the target", () => {
    const actor = start()
    actor.send({ type: "PEEK", targetUserId: "u2" })
    expect(actor.getSnapshot().matches("loading")).toBe(true)
    expect(actor.getSnapshot().context.targetUserId).toBe("u2")
  })

  it("lands in loaded with rows", () => {
    const actor = start()
    actor.send({ type: "PEEK", targetUserId: "u2" })
    actor.send({ type: "RESULT", data: { success: true, targetUserId: "u2", items: [row] } })
    const snap = actor.getSnapshot()
    expect(snap.matches("loaded")).toBe(true)
    expect(snap.context.items).toHaveLength(1)
    expect(snap.context.error).toBeNull()
  })

  it("distinguishes an authorized empty bag from a denial", () => {
    const empty = start()
    empty.send({ type: "PEEK", targetUserId: "u2" })
    empty.send({ type: "RESULT", data: { success: true, targetUserId: "u2", items: [] } })
    expect(empty.getSnapshot().matches("empty")).toBe(true)
    expect(empty.getSnapshot().context.error).toBeNull()

    const denied = start()
    denied.send({ type: "PEEK", targetUserId: "u2" })
    denied.send({ type: "RESULT", data: { success: false, message: "Not allowed" } })
    expect(denied.getSnapshot().matches("error")).toBe(true)
    expect(denied.getSnapshot().context.error).toBe("Not allowed")
  })

  it("never carries rows into a failed or timed-out peek", () => {
    const actor = start()
    actor.send({ type: "PEEK", targetUserId: "u2" })
    actor.send({ type: "RESULT", data: { success: true, targetUserId: "u2", items: [row] } })

    actor.send({ type: "PEEK", targetUserId: "u3" })
    expect(actor.getSnapshot().context.items).toEqual([])

    actor.send({ type: "TIMEOUT" })
    const snap = actor.getSnapshot()
    expect(snap.matches("error")).toBe(true)
    expect(snap.context.items).toEqual([])
    expect(snap.context.error).toBe("Peek timed out.")
  })

  it("CLOSE returns to idle and clears the target", () => {
    const actor = start()
    actor.send({ type: "PEEK", targetUserId: "u2" })
    actor.send({ type: "RESULT", data: { success: true, targetUserId: "u2", items: [row] } })
    actor.send({ type: "CLOSE" })
    const snap = actor.getSnapshot()
    expect(snap.matches("idle")).toBe(true)
    expect(snap.context.targetUserId).toBeNull()
    expect(snap.context.items).toEqual([])
  })

  it("a second PEEK while loading retargets the request", () => {
    const actor = start()
    actor.send({ type: "PEEK", targetUserId: "u2" })
    actor.send({ type: "PEEK", targetUserId: "u3" })
    const snap = actor.getSnapshot()
    expect(snap.matches("loading")).toBe(true)
    expect(snap.context.targetUserId).toBe("u3")
  })
})
