import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createActor, type Actor } from "xstate"
import { userGameStateMachine } from "./userGameStateMachine"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
  emitToSocket: vi.fn(),
}))
vi.mock("../actors/authActor", () => ({
  getCurrentUser: () => ({ userId: "me" }),
}))

const emptyPayload = {
  session: null,
  state: null,
  inventory: null,
  itemDefinitions: [],
  pluginUserState: {},
}

describe("userGameStateMachine refetch characterization", () => {
  let actor: Actor<typeof userGameStateMachine>

  beforeEach(() => {
    vi.clearAllMocks()
    actor = createActor(userGameStateMachine)
    actor.start()
  })

  afterEach(() => {
    actor.send({ type: "DEACTIVATE" })
    actor.stop()
  })

  function activateReady() {
    actor.send({ type: "ACTIVATE" })
    expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    vi.mocked(emitToSocket).mockClear()
    actor.send({ type: "USER_GAME_STATE", data: emptyPayload })
    expect(actor.getSnapshot().value).toBe("ready")
  }

  it("subscribes on ACTIVATE and unsubscribes on DEACTIVATE", () => {
    actor.send({ type: "ACTIVATE" })
    expect(subscribeById).toHaveBeenCalled()
    const subId = vi.mocked(subscribeById).mock.calls[0]![0]
    actor.send({ type: "DEACTIVATE" })
    expect(unsubscribeById).toHaveBeenCalledWith(subId)
    expect(actor.getSnapshot().value).toBe("idle")
  })

  it("stores USER_GAME_STATE payload", () => {
    activateReady()
    actor.send({
      type: "USER_GAME_STATE",
      data: {
        ...emptyPayload,
        session: { id: "s1" } as any,
        pluginUserState: { "item-shops": { currentShopInstance: null } },
      },
    })
    expect(actor.getSnapshot().context.payload?.session).toEqual({ id: "s1" })
    expect(actor.getSnapshot().context.payload?.pluginUserState?.["item-shops"]).toEqual({
      currentShopInstance: null,
    })
  })

  it("clears payload on GAME_SESSION_ENDED", () => {
    activateReady()
    actor.send({
      type: "USER_GAME_STATE",
      data: { ...emptyPayload, session: { id: "s1" } as any },
    })
    actor.send({ type: "GAME_SESSION_ENDED", data: {} })
    expect(actor.getSnapshot().context.payload?.session).toBeNull()
  })

  it("collapses the current user's own inventory burst into one refetch", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "me" } })
      actor.send({ type: "INVENTORY_ITEM_USED", data: { userId: "me" } })
      actor.send({ type: "GAME_STATE_CHANGED", data: { userId: "me" } })
      expect(emitToSocket).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
      expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("ignores game and inventory events for other users", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "someone-else" } })
      actor.send({ type: "GAME_MODIFIER_APPLIED", data: { userId: "someone-else" } })
      actor.send({
        type: "INVENTORY_ITEM_TRANSFERRED",
        data: { fromUserId: "someone-else", toUserId: "a-third-party" },
      })

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).not.toHaveBeenCalled()
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("refetches on USER_GAME_STATE_INVALIDATED (debounced)", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({
        type: "USER_GAME_STATE_INVALIDATED",
        data: { roomId: "r1", pluginName: "item-shops" },
      })
      actor.send({
        type: "USER_GAME_STATE_INVALIDATED",
        data: { roomId: "r1", pluginName: "playlist-bingo" },
      })
      expect(emitToSocket).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
      expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    } finally {
      // Flush any pending debounce before restoring real timers.
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })
})
