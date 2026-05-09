import type { BridgeSnapshot } from "./types.js"

let snapshot: BridgeSnapshot | null = null
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
  snapshot = next
  lastSyncEpochMs = Date.now()
}

export function getBridgeSnapshot(): BridgeSnapshot | null {
  return snapshot
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
