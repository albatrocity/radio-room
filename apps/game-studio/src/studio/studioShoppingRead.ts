import {
  ITEM_SHOPS_PLUGIN_NAME,
  ITEM_SHOPS_SESSION_STORAGE_KEYS,
  type ShoppingSessionInstance,
} from "@repo/types"
import type { StudioRoom } from "./studioRoom"

export function isShoppingRoundActive(room: StudioRoom): boolean {
  const store = room.ensurePluginStore(ITEM_SHOPS_PLUGIN_NAME)
  return store.kv.get(ITEM_SHOPS_SESSION_STORAGE_KEYS.ACTIVE) === "true"
}

export function readShoppingInstance(room: StudioRoom, userId: string): ShoppingSessionInstance | null {
  const store = room.ensurePluginStore(ITEM_SHOPS_PLUGIN_NAME)
  const raw = store.hashes.get(ITEM_SHOPS_SESSION_STORAGE_KEYS.INSTANCES)?.get(userId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ShoppingSessionInstance
  } catch {
    return null
  }
}
