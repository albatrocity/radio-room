import type {
  ChatMessage,
  GameSession,
  InventoryItem,
  QueueItem,
  Reaction,
  User,
  UserGameState,
} from "@repo/types"
import type { PluginKvStore, StudioEventEntry, StudioRoom } from "./studioRoom"

/** Bump when persisted shape changes (migrate in load). v2 drops definitions (always from plugin code). */
export const STUDIO_SNAPSHOT_VERSION = 2 as const

export const STUDIO_STORAGE_KEY = "radio-room-game-studio-sandbox"

/** Keep payload small for localStorage quotas (~5MB). */
const MAX_PERSIST_CHAT = 300
const MAX_PERSIST_EVENTS = 500

export type PersistedSnapshotV2 = {
  v: typeof STUDIO_SNAPSHOT_VERSION
  users: [string, User][]
  pluginConfigs: [string, Record<string, unknown>][]
  pluginStores: SerializedPluginStores
  activeSession: GameSession | null
  participants: string[]
  userStates: [string, UserGameState][]
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

export function snapshotRoom(room: StudioRoom): PersistedSnapshotV2 {
  return {
    v: STUDIO_SNAPSHOT_VERSION,
    users: [...room.users.entries()],
    pluginConfigs: [...room.pluginConfigs.entries()],
    pluginStores: serializePluginStores(room.pluginStores),
    activeSession: room.activeSession,
    participants: [...room.participants],
    userStates: [...room.userStates.entries()],
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

export function applySnapshotToRoom(room: StudioRoom, snap: PersistedSnapshotV2): void {
  room.users = new Map(snap.users)
  room.pluginConfigs = new Map(snap.pluginConfigs)
  room.pluginStores = revivePluginStores(snap.pluginStores)
  room.activeSession = snap.activeSession
  room.participants = new Set(snap.participants)
  room.userStates = new Map(snap.userStates)
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

export function loadSnapshotFromStorage(): PersistedSnapshotV2 | null {
  try {
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const v = (parsed as { v?: number }).v
    if (v !== STUDIO_SNAPSHOT_VERSION) return null
    return parsed as PersistedSnapshotV2
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

const persistenceCleanup = new WeakMap<StudioRoom, () => void>()

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
 * Idempotent per room: second attach is a no-op until detach.
 */
export function attachStudioPersistence(room: StudioRoom): void {
  if (persistenceCleanup.has(room)) return

  const schedulePersist = (): void => {
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = setTimeout(() => {
      persistDebounce = null
      flushPersist(room)
    }, 320)
  }

  const unsub = room.subscribe(schedulePersist)
  const onUnload = (): void => {
    flushPersist(room)
  }
  window.addEventListener("beforeunload", onUnload)

  persistenceCleanup.set(room, () => {
    unsub()
    window.removeEventListener("beforeunload", onUnload)
    if (persistDebounce) {
      clearTimeout(persistDebounce)
      persistDebounce = null
    }
  })
}

/** Cancel pending writes and stop saving on unload (e.g. before wiping storage). */
export function detachStudioPersistence(room: StudioRoom): void {
  persistenceCleanup.get(room)?.()
  persistenceCleanup.delete(room)
}
