import { describe, expect, it } from "vitest"
import {
  addDeputy,
  advanceRound,
  applyAdminRobin,
  clearAdminRobin,
  createInitialState,
  getEligibleUserIds,
  isEligible,
  recordSuccessfulQueue,
  removeUser,
  shouldUseExclusiveRobin,
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
})
