import { describe, expect, it } from "vitest"
import { createActor } from "xstate"
import { gameStateTradesGiftsAttentionMachine } from "./gameStateTradesGiftsAttentionMachine"

describe("gameStateTradesGiftsAttentionMachine", () => {
  it("marks unseen and clears on tab view or reset", () => {
    const actor = createActor(gameStateTradesGiftsAttentionMachine).start()
    expect(actor.getSnapshot().context.unseen).toBe(false)

    actor.send({ type: "MARK_UNSEEN" })
    expect(actor.getSnapshot().context.unseen).toBe(true)

    actor.send({ type: "TAB_VIEWED" })
    expect(actor.getSnapshot().context.unseen).toBe(false)

    actor.send({ type: "MARK_UNSEEN" })
    actor.send({ type: "RESET" })
    expect(actor.getSnapshot().context.unseen).toBe(false)
  })
})
