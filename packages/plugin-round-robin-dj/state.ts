import type { RoundRobinMode, RoundRobinState } from "./types"

export type StateTransition = {
  state: RoundRobinState
  /** Users who newly became solely eligible (for “your turn” nudges). */
  turnStartedFor: string[]
  roundAdvanced: boolean
  roundCompleted: boolean
}

function clone(state: RoundRobinState): RoundRobinState {
  return {
    ...state,
    order: [...state.order],
    participants: [...state.participants],
    queuedThisRound: [...state.queuedThisRound],
  }
}

export function createInitialState(
  mode: RoundRobinMode,
  participantIds: string[] = [],
): RoundRobinState {
  const participants = [...new Set(participantIds)]
  return {
    mode,
    phase: "open",
    order: mode === "sequential" ? [] : [...participants],
    participants,
    queuedThisRound: [],
    currentIndex: 0,
    adminForcedUserId: null,
    round: 1,
    orderLocked: false,
  }
}

/** Users who may queue right now (deputies only — callers exempt admins separately). */
export function getEligibleUserIds(state: RoundRobinState): string[] {
  if (state.phase === "roundComplete") return []

  if (state.adminForcedUserId) {
    const id = state.adminForcedUserId
    if (!state.participants.includes(id)) return []
    if (state.queuedThisRound.includes(id)) return []
    return [id]
  }

  const notQueued = state.participants.filter((id) => !state.queuedThisRound.includes(id))

  if (state.mode === "nonSequential") {
    return notQueued
  }

  // Sequential
  if (!state.orderLocked) {
    return notQueued
  }

  if (state.order.length === 0) return []
  const current = state.order[state.currentIndex]
  if (!current || state.queuedThisRound.includes(current)) return []
  if (!state.participants.includes(current)) return []
  return [current]
}

export function isEligible(state: RoundRobinState, userId: string): boolean {
  return getEligibleUserIds(state).includes(userId)
}

function allParticipantsQueued(state: RoundRobinState): boolean {
  if (state.participants.length === 0) return false
  return state.participants.every((id) => state.queuedThisRound.includes(id))
}

function startNextRound(state: RoundRobinState): RoundRobinState {
  const next = clone(state)
  next.queuedThisRound = []
  next.adminForcedUserId = null
  next.round += 1
  next.phase = next.mode === "sequential" && next.orderLocked ? "locked" : "open"
  next.currentIndex = 0

  if (next.mode === "sequential" && next.orderLocked && next.order.length > 0) {
    // Ensure currentIndex points at first participant still in order
    const idx = next.order.findIndex((id) => next.participants.includes(id))
    next.currentIndex = idx >= 0 ? idx : 0
  }

  if (next.mode === "nonSequential") {
    next.order = [...next.participants]
    next.orderLocked = false
  }

  return next
}

function maybeCompleteRound(
  state: RoundRobinState,
  autoAdvanceRounds: boolean,
): { state: RoundRobinState; roundCompleted: boolean; roundAdvanced: boolean } {
  if (!allParticipantsQueued(state)) {
    return { state, roundCompleted: false, roundAdvanced: false }
  }

  if (state.mode === "sequential" && !state.orderLocked) {
    // First round finished — lock discovery order (append any who somehow missed order)
    const locked = clone(state)
    for (const id of locked.participants) {
      if (!locked.order.includes(id)) locked.order.push(id)
    }
    locked.orderLocked = true
    locked.phase = "roundComplete"
    if (autoAdvanceRounds) {
      const advanced = startNextRound(locked)
      return { state: advanced, roundCompleted: true, roundAdvanced: true }
    }
    return { state: locked, roundCompleted: true, roundAdvanced: false }
  }

  const completed = clone(state)
  completed.phase = "roundComplete"
  if (autoAdvanceRounds) {
    return { state: startNextRound(completed), roundCompleted: true, roundAdvanced: true }
  }
  return { state: completed, roundCompleted: true, roundAdvanced: false }
}

function advanceSequentialIndex(state: RoundRobinState): RoundRobinState {
  if (state.mode !== "sequential" || !state.orderLocked || state.order.length === 0) {
    return state
  }
  const next = clone(state)
  const n = next.order.length
  for (let step = 1; step <= n; step++) {
    const idx = (next.currentIndex + step) % n
    const candidate = next.order[idx]
    if (
      candidate &&
      next.participants.includes(candidate) &&
      !next.queuedThisRound.includes(candidate)
    ) {
      next.currentIndex = idx
      return next
    }
  }
  return next
}

/**
 * Record a successful queue add by a deputy. Caller must verify eligibility first
 * (or tolerate no-op when not eligible).
 */
export function recordSuccessfulQueue(
  state: RoundRobinState,
  userId: string,
  autoAdvanceRounds: boolean,
): StateTransition {
  if (!state.participants.includes(userId)) {
    return { state, turnStartedFor: [], roundAdvanced: false, roundCompleted: false }
  }
  if (state.queuedThisRound.includes(userId)) {
    return { state, turnStartedFor: [], roundAdvanced: false, roundCompleted: false }
  }

  const beforeEligible = new Set(getEligibleUserIds(state))
  let next = clone(state)

  if (next.adminForcedUserId === userId) {
    next.adminForcedUserId = null
  }

  next.queuedThisRound = [...next.queuedThisRound, userId]

  if (next.mode === "sequential" && !next.orderLocked) {
    if (!next.order.includes(userId)) {
      next.order = [...next.order, userId]
    }
  }

  if (next.mode === "sequential" && next.orderLocked) {
    next = advanceSequentialIndex(next)
  }

  const completed = maybeCompleteRound(next, autoAdvanceRounds)
  next = completed.state

  const afterEligible = getEligibleUserIds(next)
  const turnStartedFor =
    afterEligible.length === 1 && !beforeEligible.has(afterEligible[0]!)
      ? afterEligible
      : afterEligible.filter((id) => !beforeEligible.has(id) && afterEligible.length === 1)

  // Prefer notifying when we land on a single eligible user (sequential turn)
  const notify =
    afterEligible.length === 1 && afterEligible[0] !== userId
      ? afterEligible
      : turnStartedFor

  return {
    state: next,
    turnStartedFor: notify,
    roundAdvanced: completed.roundAdvanced,
    roundCompleted: completed.roundCompleted,
  }
}

export function addDeputy(state: RoundRobinState, userId: string): RoundRobinState {
  if (state.participants.includes(userId)) return state
  const next = clone(state)
  next.participants = [...next.participants, userId]
  if (next.mode === "sequential") {
    if (next.orderLocked || next.order.length > 0) {
      next.order = [...next.order, userId]
    }
  } else {
    next.order = [...next.order, userId]
  }
  if (next.phase === "roundComplete") {
    // New participant means the completed round no longer covers everyone — reopen
    // only if not waiting on admin advance; keep roundComplete until advance/auto.
  }
  return next
}

export function removeUser(state: RoundRobinState, userId: string): StateTransition {
  if (!state.participants.includes(userId) && state.adminForcedUserId !== userId) {
    return { state, turnStartedFor: [], roundAdvanced: false, roundCompleted: false }
  }

  const beforeEligible = getEligibleUserIds(state)
  const next = clone(state)
  next.participants = next.participants.filter((id) => id !== userId)
  next.order = next.order.filter((id) => id !== userId)
  next.queuedThisRound = next.queuedThisRound.filter((id) => id !== userId)

  if (next.adminForcedUserId === userId) {
    next.adminForcedUserId = null
  }

  if (next.mode === "sequential" && next.orderLocked && next.order.length > 0) {
    if (next.currentIndex >= next.order.length) {
      next.currentIndex = 0
    }
    // If current slot was removed, land on next eligible
    const current = next.order[next.currentIndex]
    if (!current || next.queuedThisRound.includes(current)) {
      Object.assign(next, advanceSequentialIndex(next))
    }
  } else if (next.order.length === 0) {
    next.currentIndex = 0
  }

  const afterEligible = getEligibleUserIds(next)
  const turnStartedFor =
    afterEligible.length === 1 && !beforeEligible.includes(afterEligible[0]!)
      ? afterEligible
      : []

  return { state: next, turnStartedFor, roundAdvanced: false, roundCompleted: false }
}

/**
 * Admin designates Robin: sequential reorders so they are current;
 * non-sequential forces exclusive eligibility until they queue.
 */
export function applyAdminRobin(state: RoundRobinState, userId: string): StateTransition {
  const next = clone(state)
  if (!next.participants.includes(userId)) {
    next.participants = [...next.participants, userId]
  }

  if (next.mode === "sequential") {
    next.adminForcedUserId = null
    // Move user to current turn position
    next.order = next.order.filter((id) => id !== userId)
    if (next.orderLocked || next.order.length > 0) {
      const idx = Math.min(next.currentIndex, next.order.length)
      next.order.splice(idx, 0, userId)
      next.currentIndex = idx
      next.orderLocked = true
      if (next.phase === "roundComplete") {
        next.phase = "locked"
        next.queuedThisRound = next.queuedThisRound.filter((id) => id !== userId)
      } else if (next.phase === "open") {
        next.phase = "locked"
      }
    } else {
      next.order = [userId]
      next.currentIndex = 0
    }
    // Allow them to queue this round even if they already did
    next.queuedThisRound = next.queuedThisRound.filter((id) => id !== userId)
  } else {
    next.adminForcedUserId = userId
    next.queuedThisRound = next.queuedThisRound.filter((id) => id !== userId)
    if (next.phase === "roundComplete") {
      next.phase = "open"
    }
  }

  return {
    state: next,
    turnStartedFor: [userId],
    roundAdvanced: false,
    roundCompleted: false,
  }
}

export function clearAdminRobin(state: RoundRobinState): RoundRobinState {
  if (!state.adminForcedUserId) return state
  const next = clone(state)
  next.adminForcedUserId = null
  return next
}

/** Manual or auto advance into a fresh round. */
export function advanceRound(state: RoundRobinState): StateTransition {
  const next = clone(state)

  if (next.mode === "sequential" && !next.orderLocked) {
    for (const id of next.participants) {
      if (!next.order.includes(id)) next.order.push(id)
    }
    next.orderLocked = true
  }

  const advanced = startNextRound(next)
  const eligible = getEligibleUserIds(advanced)
  return {
    state: advanced,
    turnStartedFor: eligible.length === 1 ? eligible : [],
    roundAdvanced: true,
    roundCompleted: false,
  }
}

export function applyModeChange(
  state: RoundRobinState,
  mode: RoundRobinMode,
  participantIds?: string[],
): RoundRobinState {
  const participants = participantIds ?? state.participants
  return createInitialState(mode, participants)
}

export function shouldUseExclusiveRobin(state: RoundRobinState): boolean {
  if (state.adminForcedUserId) return true
  return getEligibleUserIds(state).length === 1
}

export function rejectionReason(state: RoundRobinState): string {
  if (state.phase === "roundComplete") {
    return "Round Robin: waiting for an admin to advance the round"
  }
  if (state.adminForcedUserId) {
    return "Round Robin: wait for the designated Robin to queue a song"
  }
  if (state.mode === "sequential" && state.orderLocked) {
    return "Round Robin: wait for your turn to queue"
  }
  return "Round Robin: you have already queued this round"
}
