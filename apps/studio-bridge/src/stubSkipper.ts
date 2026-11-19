/**
 * Skipper preview stub for Game Studio → Listening Room (ADR 0206, 0210).
 *
 * studio-bridge only toggles the VIP persona, so preview admins stand in for
 * Skipper holders. The snapshot queue head is now playing; the rest is waiting.
 * When pluginConfigs.skipper.skipOwnTracks is on, the head's addedBy may skip.
 */

import type { BridgeSnapshot } from "./types.js"

export const SKIPPER_PREVIEW_PLUGIN = "skipper"

function previewSkipperIds(snap: BridgeSnapshot): string[] {
  return snap.users.filter((u) => u.isAdmin).map((u) => u.userId)
}

function previewOwnTrackIds(snap: BridgeSnapshot): string[] {
  if (snap.pluginConfigs?.[SKIPPER_PREVIEW_PLUGIN]?.skipOwnTracks !== true) return []
  if (snap.queue.length < 2) return []
  const userId = snap.queue[0]?.addedBy?.userId
  return userId ? [userId] : []
}

export function buildStubSkipperState(snap: BridgeSnapshot | null, roomId: string) {
  if (!snap || snap.roomId !== roomId) {
    return { skipperUserIds: [], ownTrackUserIds: [], canSkip: false }
  }
  return {
    skipperUserIds: previewSkipperIds(snap),
    ownTrackUserIds: previewOwnTrackIds(snap),
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
  const isSkipper = previewSkipperIds(snap).includes(userId)
  const isOwnTrack = previewOwnTrackIds(snap).includes(userId)
  if (!isSkipper && !isOwnTrack) {
    return { success: false, message: "Only a Skipper can skip" }
  }
  if (snap.queue.length < 2) {
    return { success: false, message: "There's no track waiting in the queue" }
  }
  return { success: true, message: "Skipped", nextSnap: { ...snap, queue: snap.queue.slice(1) } }
}
