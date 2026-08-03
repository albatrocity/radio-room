/**
 * Round Robin DJ preview stub for Game Studio → Listening Room.
 *
 * Provides `addToQueue` component-store hydration so entitlement messages can
 * render in the Add to Queue modal. Uses the first two room users when present.
 */

import { getBridgeSnapshot } from "./snapshotStore.js"

export const ROUND_ROBIN_PREVIEW_PLUGIN = "round-robin-dj"

export function buildStubRoundRobinComponentState(roomId: string): Record<string, unknown> {
  const snap = getBridgeSnapshot()
  const users =
    snap?.roomId === roomId
      ? snap.users.filter((u) => u.isDeputyDj || u.isAdmin).map((u) => u.userId)
      : []

  const participants =
    users.length >= 2 ? users.slice(0, 2) : users.length === 1 ? [...users, "studio-guest-b"] : ["studio-guest-a", "studio-guest-b"]

  const currentTurnUserId = participants[0]!

  return {
    eligibleUserIds: [currentTurnUserId],
    holdForNextRoundUserIds: [],
    currentTurnUserId,
    hasSingleTurn: true,
    participantUserIds: participants,
  }
}
