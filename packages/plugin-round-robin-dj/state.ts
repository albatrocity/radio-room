import type { RoundRobinMode, RoundRobinState } from "./types"

export type StateTransition = {
  state: RoundRobinState
  /** Sole-eligible nudge targets from `singleNewEligible` (“your turn”). */
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
    lastTurn: state.lastTurn ? { ...state.lastTurn } : undefined,
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

/** Alias: may enqueue into the room queue right now. */
export const canEnqueueNow = isEligible

/**
 * May select a track to hold (sequential + defer option):
 * - Locked rounds: out-of-turn deputies who have not queued yet (until their turn)
 * - Open discovery: deputies who already queued this round (held for next round)
 */
export function canHold(
  state: RoundRobinState,
  userId: string,
  deferEnabled: boolean,
): boolean {
  if (!deferEnabled) return false
  if (state.mode !== "sequential") return false
  if (state.phase === "roundComplete") return false
  if (!state.participants.includes(userId)) return false
  if (canEnqueueNow(state, userId)) return false

  const alreadyQueued = state.queuedThisRound.includes(userId)

  if (state.orderLocked) {
    // Out-of-turn hold — must still have a turn left this round
    return !alreadyQueued
  }

  // First-round discovery: second pick is held for the upcoming locked round
  return alreadyQueued
}

/** Search/queue grants: current turn or may hold early. */
export function canAccessSources(
  state: RoundRobinState,
  userId: string,
  deferEnabled: boolean,
): boolean {
  return canEnqueueNow(state, userId) || canHold(state, userId, deferEnabled)
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
 * “Your turn” nudge targets after a transition.
 *
 * When exactly one deputy is eligible afterward:
 * - If they are not `excludeUserId`, always nudge them (sole turn / last remaining).
 * - If they are `excludeUserId` (or exclude is omitted), nudge only when that
 *   sole eligibility is new (`!beforeEligible.has(sole)`).
 */
export function singleNewEligible(
  beforeEligible: ReadonlySet<string>,
  afterEligible: readonly string[],
  excludeUserId?: string,
): string[] {
  if (afterEligible.length !== 1) return []
  const sole = afterEligible[0]!
  if (excludeUserId !== undefined && sole !== excludeUserId) {
    return [sole]
  }
  return beforeEligible.has(sole) ? [] : [sole]
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
  next.lastTurn = {
    userId,
    completedRound: completed.roundAdvanced ? next.round - 1 : next.round,
    roundAdvanced: completed.roundAdvanced,
  }

  return {
    state: next,
    turnStartedFor: singleNewEligible(beforeEligible, getEligibleUserIds(next), userId),
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

  const beforeEligible = new Set(getEligibleUserIds(state))
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

  return {
    state: next,
    turnStartedFor: singleNewEligible(beforeEligible, getEligibleUserIds(next)),
    roundAdvanced: false,
    roundCompleted: false,
  }
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
  advanced.lastTurn = undefined
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

export type QueueOwnerRef = { addedBy?: { userId?: string } | null }

function pointAtEligible(state: RoundRobinState, preferId?: string): RoundRobinState {
  if (state.mode !== "sequential" || !state.orderLocked || state.order.length === 0) {
    return state
  }
  const next = clone(state)
  if (
    preferId &&
    next.participants.includes(preferId) &&
    !next.queuedThisRound.includes(preferId)
  ) {
    const idx = next.order.indexOf(preferId)
    if (idx >= 0) {
      next.currentIndex = idx
      return next
    }
  }
  const idx = next.order.findIndex(
    (id) => next.participants.includes(id) && !next.queuedThisRound.includes(id),
  )
  next.currentIndex = idx >= 0 ? idx : 0
  return next
}

/**
 * Restore a deputy’s spent turn to the end of the current round after their
 * queued track is removed (ADR 0101). No-ops return the same state reference.
 */
export function restoreTurnToEndOfRound(
  state: RoundRobinState,
  userId: string,
  remainingQueue: readonly QueueOwnerRef[],
): StateTransition {
  const noop: StateTransition = {
    state,
    turnStartedFor: [],
    roundAdvanced: false,
    roundCompleted: false,
  }

  if (!state.participants.includes(userId)) return noop
  if (remainingQueue.some((item) => item.addedBy?.userId === userId)) return noop

  const rewind =
    state.lastTurn?.userId === userId &&
    state.lastTurn.roundAdvanced === true &&
    state.lastTurn.completedRound + 1 === state.round &&
    state.queuedThisRound.length === 0

  const spentThisRound = state.queuedThisRound.includes(userId)
  if (!rewind && !spentThisRound) return noop

  const beforeEligible = new Set(getEligibleUserIds(state))
  let next = clone(state)
  const currentId =
    next.mode === "sequential" && next.orderLocked ? next.order[next.currentIndex] : undefined

  if (rewind) {
    next.round = state.lastTurn!.completedRound
    next.queuedThisRound = next.participants.filter((id) => id !== userId)
    next.phase = next.orderLocked ? "locked" : "open"
  } else {
    next.queuedThisRound = next.queuedThisRound.filter((id) => id !== userId)
    if (next.phase === "roundComplete") {
      next.phase = next.mode === "sequential" && next.orderLocked ? "locked" : "open"
    }
  }

  if (next.mode === "sequential" && !next.orderLocked) {
    next.order = next.order.filter((id) => id !== userId)
  } else if (next.mode === "sequential" && next.orderLocked) {
    next.order = [...next.order.filter((id) => id !== userId), userId]
    const onlyRemaining =
      next.participants.filter((id) => !next.queuedThisRound.includes(id)).length === 1
    next = pointAtEligible(next, onlyRemaining || rewind ? userId : currentId)
  }

  next.lastTurn = undefined

  return {
    state: next,
    turnStartedFor: singleNewEligible(beforeEligible, getEligibleUserIds(next), userId),
    roundAdvanced: false,
    roundCompleted: false,
  }
}
