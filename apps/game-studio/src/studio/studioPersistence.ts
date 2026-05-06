import type {
  ChatMessage,
  GameSession,
  InventoryItem,
  ItemDefinition,
  QueueItem,
  Reaction,
  User,
  UserGameState,
} from "@repo/types"
import type { PluginKvStore, StudioEventEntry, StudioRoom } from "./studioRoom"

/** Bump when persisted shape changes (migrate in load). */
export const STUDIO_SNAPSHOT_VERSION = 1 as const

export const STUDIO_STORAGE_KEY = "radio-room-game-studio-sandbox"

/** Keep payload small for localStorage quotas (~5MB). */
const MAX_PERSIST_CHAT = 300
const MAX_PERSIST_EVENTS = 500

export type PersistedSnapshotV1 = {
  v: typeof STUDIO_SNAPSHOT_VERSION
  users: [string, User][]
  pluginConfigs: [string, Record<string, unknown>][]
  pluginStores: SerializedPluginStores
  activeSession: GameSession | null
  participants: string[]
  userStates: [string, UserGameState][]
  definitions: [string, ItemDefinition][]
  inventories: [string, InventoryItem[]][]
  leaderboardScores: [string, [string, number][]][]
  queue: QueueItem[]
  chat: ChatMessage[]
  events: StudioEventEntry[]
  reactions: [string, Reaction[]][]
}

type SerializedPluginStores = Record<
  string,
  {
    kv: [string, string][]
    hashes: [string, [string, string][]][]
    zsets: [string, [string, number][]][]
  }
>

function serializePluginStores(stores: Map<string, PluginKvStore>): SerializedPluginStores {
  const out: SerializedPluginStores = {}
  for (const [name, s] of stores) {
    out[name] = {
      kv: [...s.kv.entries()],
      hashes: [...s.hashes.entries()].map(([hk, h]) => [hk, [...h.entries()]]),
      zsets: [...s.zsets.entries()].map(([zk, z]) => [zk, [...z.entries()]]),
    }
  }
  return out
}

function revivePluginStores(raw: SerializedPluginStores): Map<string, PluginKvStore> {
  const stores = new Map<string, PluginKvStore>()
  for (const [name, buckets] of Object.entries(raw)) {
    const kv = new Map(buckets.kv)
    const hashes = new Map<string, Map<string, string>>()
    for (const [hk, entries] of buckets.hashes) {
      hashes.set(hk, new Map(entries))
    }
    const zsets = new Map<string, Map<string, number>>()
    for (const [zk, entries] of buckets.zsets) {
      zsets.set(zk, new Map(entries))
    }
    stores.set(name, { kv, hashes, zsets })
  }
  return stores
}

export function snapshotRoom(room: StudioRoom): PersistedSnapshotV1 {
  return {
    v: STUDIO_SNAPSHOT_VERSION,
    users: [...room.users.entries()],
    pluginConfigs: [...room.pluginConfigs.entries()],
    pluginStores: serializePluginStores(room.pluginStores),
    activeSession: room.activeSession,
    participants: [...room.participants],
    userStates: [...room.userStates.entries()],
    definitions: [...room.definitions.entries()],
    inventories: [...room.inventories.entries()],
    leaderboardScores: [...room.leaderboardScores.entries()].map(([lbId, m]) => [
      lbId,
      [...m.entries()],
    ]),
    queue: room.queue,
    chat: room.chat.slice(-MAX_PERSIST_CHAT),
    events: room.events.slice(-MAX_PERSIST_EVENTS),
    reactions: [...room.reactions.entries()],
  }
}

export function applySnapshotToRoom(room: StudioRoom, snap: PersistedSnapshotV1): void {
  room.users = new Map(snap.users)
  room.pluginConfigs = new Map(snap.pluginConfigs)
  room.pluginStores = revivePluginStores(snap.pluginStores)
  room.activeSession = snap.activeSession
  room.participants = new Set(snap.participants)
  room.userStates = new Map(snap.userStates)
  room.definitions = new Map(snap.definitions)
  room.inventories = new Map(snap.inventories)
  room.leaderboardScores = new Map(
    snap.leaderboardScores.map(([lbId, rows]) => [lbId, new Map(rows)]),
  )
  room.queue = snap.queue
  room.chat = snap.chat
  room.events = snap.events
  room.reactions = new Map(snap.reactions)
  room.notify()
}

export function persistStudioRoom(room: StudioRoom): void {
  const snap = snapshotRoom(room)
  const json = JSON.stringify(snap)
  localStorage.setItem(STUDIO_STORAGE_KEY, json)
}

export function loadSnapshotFromStorage(): PersistedSnapshotV1 | null {
  try {
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const v = (parsed as { v?: number }).v
    if (v !== STUDIO_SNAPSHOT_VERSION) return null
    return parsed as PersistedSnapshotV1
  } catch {
    return null
  }
}

export function clearPersistedSnapshot(): void {
  localStorage.removeItem(STUDIO_STORAGE_KEY)
}

export function tryHydrateRoom(room: StudioRoom): boolean {
  const snap = loadSnapshotFromStorage()
  if (!snap) return false
  applySnapshotToRoom(room, snap)
  return true
}

let persistDebounce: ReturnType<typeof setTimeout> | null = null

function flushPersist(room: StudioRoom): void {
  if (persistDebounce) {
    clearTimeout(persistDebounce)
    persistDebounce = null
  }
  try {
    persistStudioRoom(room)
  } catch (e) {
    console.warn("[game-studio] Failed to persist sandbox state:", e)
  }
}

/**
 * Debounced persist on room mutations. Call once after bootstrap + hydrate.
 */
export function attachStudioPersistence(room: StudioRoom): void {
  room.subscribe(() => {
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = setTimeout(() => {
      persistDebounce = null
      flushPersist(room)
    }, 320)
  })

  window.addEventListener("beforeunload", () => flushPersist(room))
}

/** Clear saved state and reload so plugins re-register cleanly. */
export function resetStudioPersistenceAndReload(): void {
  clearPersistedSnapshot()
  window.location.reload()
}
