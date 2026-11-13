/**
 * Skipper preview stub for Game Studio → Listening Room (ADR 0206).
 *
 * studio-bridge only toggles the VIP persona, so preview admins stand in for
 * Skipper holders. The snapshot queue head is now playing; the rest is waiting.
 */

import type { BridgeSnapshot } from "./types.js"

export const SKIPPER_PREVIEW_PLUGIN = "skipper"

function previewSkipperIds(snap: BridgeSnapshot): string[] {
  return snap.users.filter((u) => u.isAdmin).map((u) => u.userId)
}

export function buildStubSkipperState(snap: BridgeSnapshot | null, roomId: string) {
  if (!snap || snap.roomId !== roomId) return { skipperUserIds: [], canSkip: false }
  return {
    skipperUserIds: previewSkipperIds(snap),
    canSkip: snap.queue.length >= 2,
  }
}

export function runStubSkipperAction(
  snap: BridgeSnapshot | null,
  roomId: string,
  userId: string,
  action: string,
): { success: boolean; message?: string; nextSnap?: BridgeSnapshot } {
  if (action !== "skip") return { success: false, message: `Unknown action: ${action}` }
  if (!snap || snap.roomId !== roomId) return { success: false, message: "No preview room" }
  if (!previewSkipperIds(snap).includes(userId)) {
    return { success: false, message: "Only a Skipper can skip" }
  }
  if (snap.queue.length < 2) {
    return { success: false, message: "There's no track waiting in the queue" }
  }
  return { success: true, message: "Skipped", nextSnap: { ...snap, queue: snap.queue.slice(1) } }
}
