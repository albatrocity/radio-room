import { describe, expect, it } from "vitest"
import {
  addDeputy,
  advanceRound,
  applyAdminRobin,
  applyModeChange,
  canAccessSources,
  canHold,
  clearAdminRobin,
  createInitialState,
  getEligibleUserIds,
  isEligible,
  isOrderedMode,
  recordSuccessfulQueue,
  restoreTurnToEndOfRound,
  removeUser,
  shouldUseExclusiveRobin,
  singleNewEligible,
} from "./state"

describe("round-robin state", () => {
  describe("sequential discovery", () => {
    it("allows any participant who has not queued during open discovery", () => {
      const state = createInitialState("sequential", ["a", "b", "c"])
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "b", "c"])
      expect(state.orderLocked).toBe(false)
    })

    it("builds order from queue sequence and locks after everyone queues", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])

      let t = recordSuccessfulQueue(state, "b", true)
      state = t.state
      expect(state.order).toEqual(["b"])
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "c"])

      t = recordSuccessfulQueue(state, "a", true)
      state = t.state
      expect(state.order).toEqual(["b", "a"])

      t = recordSuccessfulQueue(state, "c", true)
      state = t.state
      expect(state.orderLocked).toBe(true)
      expect(state.order).toEqual(["b", "a", "c"])
      expect(state.round).toBe(2)
      expect(state.phase).toBe("locked")
      expect(getEligibleUserIds(state)).toEqual(["b"])
      expect(shouldUseExclusiveRobin(state)).toBe(true)
    })

    it("pauses on round complete when auto-advance is off", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", false).state
      const t = recordSuccessfulQueue(state, "b", false)
      expect(t.roundCompleted).toBe(true)
      expect(t.roundAdvanced).toBe(false)
      expect(t.state.phase).toBe("roundComplete")
      expect(getEligibleUserIds(t.state)).toEqual([])
    })

    it("enforces turn order after lock", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      // round 2, locked, a then b
      expect(isEligible(state, "a")).toBe(true)
      expect(isEligible(state, "b")).toBe(false)

      state = recordSuccessfulQueue(state, "a", true).state
      expect(isEligible(state, "b")).toBe(true)
      expect(isEligible(state, "a")).toBe(false)
    })
  })

  describe("non-sequential", () => {
    it("is FCFS among those who have not queued", () => {
      let state = createInitialState("nonSequential", ["a", "b", "c"])
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "b", "c"])
      expect(shouldUseExclusiveRobin(state)).toBe(false)

      state = recordSuccessfulQueue(state, "c", true).state
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "b"])

      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      expect(state.round).toBe(2)
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "b", "c"])
    })

    it("admin Robin forces exclusive eligibility", () => {
      let state = createInitialState("nonSequential", ["a", "b", "c"])
      const t = applyAdminRobin(state, "b")
      state = t.state
      expect(state.adminForcedUserId).toBe("b")
      expect(getEligibleUserIds(state)).toEqual(["b"])
      expect(shouldUseExclusiveRobin(state)).toBe(true)

      state = recordSuccessfulQueue(state, "b", true).state
      expect(state.adminForcedUserId).toBeNull()
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "c"])
    })

    it("clearAdminRobin restores FCFS", () => {
      let state = createInitialState("nonSequential", ["a", "b"])
      state = applyAdminRobin(state, "a").state
      state = clearAdminRobin(state)
      expect(getEligibleUserIds(state).sort()).toEqual(["a", "b"])
    })
  })

  describe("roster changes", () => {
    it("appends new deputies to the end in sequential mode", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = addDeputy(state, "c")
      expect(state.participants).toEqual(["a", "b", "c"])
      expect(state.order).toEqual(["a", "b", "c"])
    })

    it("removes users from order and advances turn", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2, current a
      const t = removeUser(state, "a")
      expect(t.state.participants).toEqual(["b", "c"])
      expect(getEligibleUserIds(t.state)).toEqual(["b"])
    })
  })

  describe("advanceRound", () => {
    it("locks partial discovery order and starts a new round", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "b", false).state
      const t = advanceRound(state)
      expect(t.state.orderLocked).toBe(true)
      expect(t.state.order).toEqual(["b", "a", "c"])
      expect(t.state.round).toBe(2)
      expect(t.state.queuedThisRound).toEqual([])
      expect(getEligibleUserIds(t.state)).toEqual(["b"])
    })
  })

  describe("applyAdminRobin sequential", () => {
    it("moves designated user to current turn", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // locked order a,b,c — current a
      state = recordSuccessfulQueue(state, "a", true).state
      // current b
      const t = applyAdminRobin(state, "c")
      expect(getEligibleUserIds(t.state)).toEqual(["c"])
      expect(t.state.order[t.state.currentIndex]).toBe("c")
    })
  })

  describe("turnStartedFor / singleNewEligible", () => {
    it("nudges the next sequential deputy after a locked turn", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      // round 2 locked — a's turn
      const t = recordSuccessfulQueue(state, "a", true)
      expect(t.turnStartedFor).toEqual(["b"])
    })

    it("nudges the last remaining non-sequential deputy even if they were already eligible", () => {
      let state = createInitialState("nonSequential", ["a", "b"])
      const t = recordSuccessfulQueue(state, "a", true)
      expect(t.turnStartedFor).toEqual(["b"])
    })

    it("does not nudge during open discovery while multiple deputies remain", () => {
      const state = createInitialState("sequential", ["a", "b", "c"])
      const t = recordSuccessfulQueue(state, "a", true)
      expect(t.turnStartedFor).toEqual([])
    })

    it("nudges first locked-order deputy when discovery auto-advances", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      const t = recordSuccessfulQueue(state, "b", true)
      expect(t.roundAdvanced).toBe(true)
      expect(t.turnStartedFor).toEqual(["a"])
    })

    it("singleNewEligible: sole non-excluded → nudge; sole excluded only if new", () => {
      expect(singleNewEligible(new Set(["a", "b"]), ["b"], "a")).toEqual(["b"])
      expect(singleNewEligible(new Set(["a"]), ["a"], "a")).toEqual([])
      expect(singleNewEligible(new Set(), ["a"], "a")).toEqual(["a"])
      expect(singleNewEligible(new Set(["a"]), ["b"])).toEqual(["b"])
      expect(singleNewEligible(new Set(["a", "b"]), ["a", "b"], "a")).toEqual([])
    })
  })

  describe("canHold / canAccessSources", () => {
    it("allows hold for out-of-turn deputies when locked and defer enabled", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2 locked, current a
      expect(canHold(state, "b", true)).toBe(true)
      expect(canHold(state, "a", true)).toBe(false)
      expect(canHold(state, "b", false)).toBe(false)
      expect(canAccessSources(state, "b", true)).toBe(true)
      expect(canAccessSources(state, "a", true)).toBe(true)
    })

    it("does not allow hold during open discovery before the first queue", () => {
      const state = createInitialState("sequential", ["a", "b"])
      expect(state.orderLocked).toBe(false)
      expect(canHold(state, "a", true)).toBe(false)
    })

    it("allows hold for next round after queuing during open discovery", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      expect(state.orderLocked).toBe(false)
      expect(canHold(state, "a", true)).toBe(true)
      expect(canHold(state, "b", true)).toBe(false) // b has not queued yet — should enqueue live
      expect(canAccessSources(state, "a", true)).toBe(true)
    })
  })

  describe("restoreTurnToEndOfRound", () => {
    it("drops discovery order slot so they do not keep first-slot privilege", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      expect(state.order).toEqual(["a"])
      const t = restoreTurnToEndOfRound(state, "a", [])
      expect(t.state.queuedThisRound).toEqual([])
      expect(t.state.order).toEqual([])
      expect(getEligibleUserIds(t.state).sort()).toEqual(["a", "b", "c"])
    })

    it("moves a locked-round undoer to the end and keeps the current player", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2 locked, a then b then c
      state = recordSuccessfulQueue(state, "a", true).state
      expect(getEligibleUserIds(state)).toEqual(["b"])
      expect(state.queuedThisRound).toEqual(["a"])

      const t = restoreTurnToEndOfRound(state, "a", [])
      expect(t.state.queuedThisRound).toEqual([])
      expect(t.state.order).toEqual(["b", "c", "a"])
      expect(getEligibleUserIds(t.state)).toEqual(["b"])
    })

    it("reopens roundComplete onto the last remaining undoer", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", false).state
      state = recordSuccessfulQueue(state, "b", false).state
      expect(state.phase).toBe("roundComplete")

      const t = restoreTurnToEndOfRound(state, "b", [])
      expect(t.state.phase).toBe("locked")
      expect(t.state.queuedThisRound).toEqual(["a"])
      expect(getEligibleUserIds(t.state)).toEqual(["b"])
    })

    it("rewinds auto-advance when lastTurn matches and the new round is empty", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      expect(state.round).toBe(2)
      expect(state.queuedThisRound).toEqual([])
      expect(state.lastTurn).toEqual({
        userId: "b",
        completedRound: 1,
        roundAdvanced: true,
      })

      const t = restoreTurnToEndOfRound(state, "b", [])
      expect(t.state.round).toBe(1)
      expect(t.state.queuedThisRound).toEqual(["a"])
      expect(t.state.order[t.state.order.length - 1]).toBe("b")
      expect(getEligibleUserIds(t.state)).toEqual(["b"])
    })

    it("does not rewind after someone else has queued in the new round", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "a", true).state
      expect(state.round).toBe(2)
      expect(state.queuedThisRound).toEqual(["a"])

      const t = restoreTurnToEndOfRound(state, "b", [])
      expect(t.state).toBe(state)
    })

    it("does not rewind after admin advanceRound (lastTurn cleared)", () => {
      let state = createInitialState("sequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", false).state
      state = recordSuccessfulQueue(state, "b", false).state
      state = advanceRound(state).state
      expect(state.lastTurn).toBeUndefined()

      const t = restoreTurnToEndOfRound(state, "b", [])
      expect(t.state).toBe(state)
    })

    it("unmarks only queuedThisRound in nonSequential mode", () => {
      let state = createInitialState("nonSequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "c", true).state
      const t = restoreTurnToEndOfRound(state, "c", [])
      expect(t.state.queuedThisRound).toEqual([])
      expect(getEligibleUserIds(t.state).sort()).toEqual(["a", "b", "c"])
    })

    it("skips restore when the owner still has a remaining queue row", () => {
      let state = createInitialState("nonSequential", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      const t = restoreTurnToEndOfRound(state, "a", [{ addedBy: { userId: "a" } }])
      expect(t.state).toBe(state)
    })
  })

  describe("isOrderedMode", () => {
    it("is true for sequential and forwardAndBack", () => {
      expect(isOrderedMode("sequential")).toBe(true)
      expect(isOrderedMode("forwardAndBack")).toBe(true)
      expect(isOrderedMode("nonSequential")).toBe(false)
    })
  })

  describe("forwardAndBack", () => {
    it("snakes after discovery: A,B,C then C goes again with direction -1", () => {
      let state = createInitialState("forwardAndBack", ["a", "b", "c"])
      expect(state.direction).toBe(1)

      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      const t = recordSuccessfulQueue(state, "c", true)
      state = t.state

      expect(state.orderLocked).toBe(true)
      expect(state.order).toEqual(["a", "b", "c"])
      expect(state.round).toBe(2)
      expect(state.direction).toBe(-1)
      expect(getEligibleUserIds(state)).toEqual(["c"])
      expect(t.turnStartedFor).toEqual(["c"])
      expect(t.roundAdvanced).toBe(true)
    })

    it("continues C,B,A then flips back so A goes again", () => {
      let state = createInitialState("forwardAndBack", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2, direction -1, C's turn
      state = recordSuccessfulQueue(state, "c", true).state
      expect(getEligibleUserIds(state)).toEqual(["b"])

      state = recordSuccessfulQueue(state, "b", true).state
      expect(getEligibleUserIds(state)).toEqual(["a"])

      const t = recordSuccessfulQueue(state, "a", true)
      state = t.state
      expect(state.round).toBe(3)
      expect(state.direction).toBe(1)
      expect(getEligibleUserIds(state)).toEqual(["a"])
      expect(t.turnStartedFor).toEqual(["a"])
    })

    it("with two deputies alternates double-turns: A,B then B,A then A,…", () => {
      let state = createInitialState("forwardAndBack", ["a", "b"])
      state = recordSuccessfulQueue(state, "a", true).state
      let t = recordSuccessfulQueue(state, "b", true)
      state = t.state
      expect(state.round).toBe(2)
      expect(state.direction).toBe(-1)
      expect(getEligibleUserIds(state)).toEqual(["b"])
      expect(t.turnStartedFor).toEqual(["b"])

      t = recordSuccessfulQueue(state, "b", true)
      state = t.state
      expect(getEligibleUserIds(state)).toEqual(["a"])

      t = recordSuccessfulQueue(state, "a", true)
      state = t.state
      expect(state.round).toBe(3)
      expect(state.direction).toBe(1)
      expect(getEligibleUserIds(state)).toEqual(["a"])
      expect(t.turnStartedFor).toEqual(["a"])
    })

    it("sequential still restarts at first name after lock", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      expect(state.round).toBe(2)
      expect(state.direction).toBe(1)
      expect(getEligibleUserIds(state)).toEqual(["a"])
    })

    it("manual advanceRound after C locks and starts C's reverse turn", () => {
      let state = createInitialState("forwardAndBack", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", false).state
      state = recordSuccessfulQueue(state, "b", false).state
      state = recordSuccessfulQueue(state, "c", false).state
      expect(state.phase).toBe("roundComplete")
      expect(state.orderLocked).toBe(true)

      const t = advanceRound(state)
      expect(t.state.round).toBe(2)
      expect(t.state.direction).toBe(-1)
      expect(getEligibleUserIds(t.state)).toEqual(["c"])
      expect(t.turnStartedFor).toEqual(["c"])
    })

    it("rewinds auto-advance undo of C's discovery finish back to round 1 forward", () => {
      let state = createInitialState("forwardAndBack", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      expect(state.round).toBe(2)
      expect(state.direction).toBe(-1)
      expect(getEligibleUserIds(state)).toEqual(["c"])
      expect(state.lastTurn).toEqual({
        userId: "c",
        completedRound: 1,
        roundAdvanced: true,
      })

      const t = restoreTurnToEndOfRound(state, "c", [])
      expect(t.state.round).toBe(1)
      expect(t.state.direction).toBe(1)
      expect(t.state.queuedThisRound).toEqual(["a", "b"])
      expect(getEligibleUserIds(t.state)).toEqual(["c"])
    })

    it("prepends undoer when walking backward and keeps current player", () => {
      let state = createInitialState("forwardAndBack", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2 back: C then B
      state = recordSuccessfulQueue(state, "c", true).state
      expect(getEligibleUserIds(state)).toEqual(["b"])
      expect(state.direction).toBe(-1)
      expect(state.queuedThisRound).toEqual(["c"])

      const t = restoreTurnToEndOfRound(state, "c", [])
      expect(t.state.queuedThisRound).toEqual([])
      expect(t.state.order[0]).toBe("c")
      expect(getEligibleUserIds(t.state)).toEqual(["b"])
    })

    it("preserves order when switching sequential ↔ forwardAndBack", () => {
      let state = createInitialState("sequential", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2 locked, a then b then c
      state = recordSuccessfulQueue(state, "a", true).state
      expect(state.order).toEqual(["a", "b", "c"])
      expect(getEligibleUserIds(state)).toEqual(["b"])

      state = applyModeChange(state, "forwardAndBack")
      expect(state.mode).toBe("forwardAndBack")
      expect(state.order).toEqual(["a", "b", "c"])
      expect(state.round).toBe(2)
      expect(state.direction).toBe(1)
      expect(state.queuedThisRound).toEqual(["a"])
      expect(getEligibleUserIds(state)).toEqual(["b"])
    })

    it("allows hold in forwardAndBack when defer enabled", () => {
      let state = createInitialState("forwardAndBack", ["a", "b", "c"])
      state = recordSuccessfulQueue(state, "a", true).state
      state = recordSuccessfulQueue(state, "b", true).state
      state = recordSuccessfulQueue(state, "c", true).state
      // round 2, C's turn (reverse)
      expect(canHold(state, "b", true)).toBe(true)
      expect(canHold(state, "c", true)).toBe(false)
      expect(canAccessSources(state, "a", true)).toBe(true)
    })
  })
})
