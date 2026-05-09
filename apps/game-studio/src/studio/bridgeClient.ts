import type {
  ChatMessage,
  GameSession,
  InventoryItem,
  ItemDefinition,
  QueueItem,
  ShoppingSessionInstance,
  User,
  UserGameState,
} from "@repo/types"
import { readShoppingInstance } from "./studioShoppingRead"
import type { StudioRoom } from "./studioRoom"

/**
 * Must stay aligned with `apps/studio-bridge/src/types.ts` `BridgeSnapshot`.
 * Serialized JSON POSTed to `POST /sync`.
 */
export type StudioBridgeSnapshot = {
  roomId: string
  users: User[]
  chat: ChatMessage[]
  queue: QueueItem[]
  activeSession: GameSession | null
  userStates: Record<string, UserGameState>
  inventories: Record<string, InventoryItem[]>
  itemDefinitions: ItemDefinition[]
  pluginConfigs: Record<string, Record<string, unknown>>
  shoppingByUser: Record<string, ShoppingSessionInstance | null>
}

export function serializeStudioRoom(room: StudioRoom): StudioBridgeSnapshot {
  const users = [...room.users.values()]
  const userStates: Record<string, UserGameState> = {}
  for (const [uid, st] of room.userStates) {
    userStates[uid] = st
  }
  const inventories: Record<string, InventoryItem[]> = {}
  for (const [uid, inv] of room.inventories) {
    inventories[uid] = inv
  }
  const pluginConfigs: Record<string, Record<string, unknown>> = {}
  for (const [name, cfg] of room.pluginConfigs) {
    pluginConfigs[name] = cfg
  }
  const shoppingByUser: Record<string, ShoppingSessionInstance | null> = {}
  for (const u of users) {
    shoppingByUser[u.userId] = readShoppingInstance(room, u.userId)
  }

  return {
    roomId: room.roomId,
    users,
    chat: room.chat,
    queue: room.queue,
    activeSession: room.activeSession,
    userStates,
    inventories,
    itemDefinitions: [...room.definitions.values()],
    pluginConfigs,
    shoppingByUser,
  }
}

const DEBOUNCE_MS = 150

let studioBridgeSyncWarned = false

/**
 * Push sandbox state to the local studio-bridge server whenever `StudioRoom` mutates.
 * Set `VITE_STUDIO_BRIDGE_URL` (e.g. http://127.0.0.1:3099) — `make game-studio` starts the bridge.
 */
export function connectStudioBridge(room: StudioRoom, baseUrl: string): () => void {
  const root = baseUrl.replace(/\/$/, "")
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const flush = async (): Promise<void> => {
    if (cancelled) return
    const body = serializeStudioRoom(room)
    try {
      await fetch(`${root}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (!studioBridgeSyncWarned) {
        studioBridgeSyncWarned = true
        console.warn("[game-studio] studio-bridge sync failed (is `make game-studio` running?)", e)
      }
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, DEBOUNCE_MS)
  }

  const unsub = room.subscribe(schedule)
  void flush()

  return () => {
    cancelled = true
    unsub()
    if (timer) clearTimeout(timer)
  }
}
