import { describe, expect, it } from "vitest"
import { buildQueueStatusStore, EMPTY_QUEUE_STATUS_STORE } from "./componentState"
import { createInitialState, recordSuccessfulQueue } from "./state"

describe("buildQueueStatusStore", () => {
  it("returns empty store when disabled or missing state", () => {
    expect(buildQueueStatusStore(null, { enabled: true, deferOutOfTurnQueues: true })).toEqual(
      EMPTY_QUEUE_STATUS_STORE,
    )
    expect(
      buildQueueStatusStore(createInitialState("sequential", ["a"]), {
        enabled: false,
        deferOutOfTurnQueues: true,
      }),
    ).toEqual(EMPTY_QUEUE_STATUS_STORE)
  })

  it("lists all participants as eligible during open discovery", () => {
    const state = createInitialState("sequential", ["a", "b", "c"])
    const store = buildQueueStatusStore(state, { enabled: true, deferOutOfTurnQueues: false })
    expect(store.eligibleUserIds.sort()).toEqual(["a", "b", "c"])
    expect(store.hasSingleTurn).toBe(false)
    expect(store.currentTurnUserId).toBeNull()
    expect(store.holdForNextRoundUserIds).toEqual([])
    expect(store.participantUserIds).toEqual(["a", "b", "c"])
  })

  it("sets sole turn fields after lock", () => {
    let state = createInitialState("sequential", ["a", "b"])
    state = recordSuccessfulQueue(state, "a", true).state
    state = recordSuccessfulQueue(state, "b", true).state
    // round 2 locked — a's turn
    const store = buildQueueStatusStore(state, { enabled: true, deferOutOfTurnQueues: false })
    expect(store.eligibleUserIds).toEqual(["a"])
    expect(store.currentTurnUserId).toBe("a")
    expect(store.hasSingleTurn).toBe(true)
    expect(store.holdForNextRoundUserIds).toEqual([])
  })

  it("lists already-queued open-discovery deputies for next-round hold when defer is on", () => {
    let state = createInitialState("sequential", ["a", "b", "c"])
    state = recordSuccessfulQueue(state, "a", true).state
    expect(state.orderLocked).toBe(false)

    const withDefer = buildQueueStatusStore(state, {
      enabled: true,
      deferOutOfTurnQueues: true,
    })
    expect(withDefer.eligibleUserIds.sort()).toEqual(["b", "c"])
    expect(withDefer.holdForNextRoundUserIds).toEqual(["a"])

    const withoutDefer = buildQueueStatusStore(state, {
      enabled: true,
      deferOutOfTurnQueues: false,
    })
    expect(withoutDefer.holdForNextRoundUserIds).toEqual([])
  })

  it("does not treat locked out-of-turn hold as next-round hold", () => {
    let state = createInitialState("sequential", ["a", "b"])
    state = recordSuccessfulQueue(state, "a", true).state
    state = recordSuccessfulQueue(state, "b", true).state
    // locked, a eligible, b canHold for this-round turn but not next-round
    const store = buildQueueStatusStore(state, { enabled: true, deferOutOfTurnQueues: true })
    expect(store.eligibleUserIds).toEqual(["a"])
    expect(store.holdForNextRoundUserIds).toEqual([])
  })
})
