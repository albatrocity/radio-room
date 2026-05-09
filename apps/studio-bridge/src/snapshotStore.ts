import type { User } from "@repo/types/User"
import type { BridgeSnapshot } from "./types.js"

let snapshot: BridgeSnapshot | null = null
/** Snapshot before the latest `setBridgeSnapshot` (used for USER_JOINED/USER_LEFT / TRACK_CHANGED diffs). */
let previousBridgeSnapshot: BridgeSnapshot | null = null
/** Wall-clock ms when the last POST /sync payload was accepted (stable `lastRefreshedAt` for stubs). */
let lastSyncEpochMs = 0
let previousRoomIdForFingerprint: string | null = null

/** Full snapshot fingerprint — skip Socket.IO broadcast when unchanged (avoids React update storms). */
let lastBroadcastFingerprint = ""

function fingerprintSnapshot(s: BridgeSnapshot): string {
  return JSON.stringify({
    roomId: s.roomId,
    chat: s.chat,
    queue: s.queue,
    users: s.users,
    userStates: s.userStates,
    inventories: s.inventories,
    activeSession: s.activeSession,
    itemDefinitions: s.itemDefinitions,
    pluginConfigs: s.pluginConfigs,
    shoppingByUser: s.shoppingByUser,
  })
}

export function setBridgeSnapshot(next: BridgeSnapshot): void {
  if (previousRoomIdForFingerprint !== next.roomId) {
    lastBroadcastFingerprint = ""
  }
  previousRoomIdForFingerprint = next.roomId
  previousBridgeSnapshot = snapshot
  snapshot = next
  lastSyncEpochMs = Date.now()
}

export function getBridgeSnapshot(): BridgeSnapshot | null {
  return snapshot
}

/** Snapshot prior to the last `POST /sync` (compare with `getBridgeSnapshot()` for diffs). */
export function getPreviousBridgeSnapshot(): BridgeSnapshot | null {
  return previousBridgeSnapshot
}

/** Compare user lists between syncs (same `roomId` only). */
export function diffUsers(
  oldSnap: BridgeSnapshot | null,
  newSnap: BridgeSnapshot,
): { joined: User[]; left: User[] } {
  if (!oldSnap || oldSnap.roomId !== newSnap.roomId) {
    return { joined: [], left: [] }
  }
  const oldIds = new Set(oldSnap.users.map((u) => u.userId))
  const newIds = new Set(newSnap.users.map((u) => u.userId))
  const joined = newSnap.users.filter((u) => !oldIds.has(u.userId))
  const left = oldSnap.users.filter((u) => !newIds.has(u.userId))
  return { joined, left }
}

/** Stable identity for the queue head (now playing) for synthetic TRACK_CHANGED. */
export function queueHeadTrackId(s: BridgeSnapshot | null): string | null {
  const id = s?.queue?.[0]?.mediaSource?.trackId
  return id ?? null
}

export function getLastSyncEpochMs(): number {
  return lastSyncEpochMs
}

/** Returns false when this snapshot was already broadcast (identical to previous). */
export function consumeSnapshotBroadcast(s: BridgeSnapshot): boolean {
  const fp = fingerprintSnapshot(s)
  if (fp === lastBroadcastFingerprint) return false
  lastBroadcastFingerprint = fp
  return true
}
