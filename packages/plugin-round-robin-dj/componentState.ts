import { canHold, getEligibleUserIds } from "./state"
import type { RoundRobinDjConfig, RoundRobinState } from "./types"

/** Room-wide component store for Add to Queue entitlement messages. */
export type RoundRobinQueueStatusStore = {
  eligibleUserIds: string[]
  holdForNextRoundUserIds: string[]
  currentTurnUserId: string | null
  hasSingleTurn: boolean
  participantUserIds: string[]
}

export const EMPTY_QUEUE_STATUS_STORE: RoundRobinQueueStatusStore = {
  eligibleUserIds: [],
  holdForNextRoundUserIds: [],
  currentTurnUserId: null,
  hasSingleTurn: false,
  participantUserIds: [],
}

export const QUEUE_STATUS_STORE_KEYS = Object.keys(
  EMPTY_QUEUE_STATUS_STORE,
) as (keyof RoundRobinQueueStatusStore)[]

/**
 * Derive declarative UI store fields from round-robin state.
 * Hold track payloads are intentionally omitted.
 */
export function buildQueueStatusStore(
  state: RoundRobinState | null,
  config: Pick<RoundRobinDjConfig, "enabled" | "deferOutOfTurnQueues"> | null,
): RoundRobinQueueStatusStore {
  if (!config?.enabled || !state) {
    return { ...EMPTY_QUEUE_STATUS_STORE }
  }

  const eligibleUserIds = getEligibleUserIds(state)
  const currentTurnUserId = eligibleUserIds.length === 1 ? (eligibleUserIds[0] ?? null) : null

  // Open discovery + defer: already-queued deputies may hold for next round.
  // `canHold` in locked rounds is "until your turn" — excluded here via orderLocked.
  const holdForNextRoundUserIds = state.participants.filter(
    (userId) => canHold(state, userId, config.deferOutOfTurnQueues) && !state.orderLocked,
  )

  return {
    eligibleUserIds,
    holdForNextRoundUserIds,
    currentTurnUserId,
    hasSingleTurn: currentTurnUserId !== null,
    participantUserIds: [...state.participants],
  }
}
