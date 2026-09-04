/**
 * Physical Media condition feedback on inventory DOM nodes.
 * - Wear (UPDATED worse / REMOVED degraded) → headShake
 * - Restore (UPDATED better / ACQUIRED restored) → restoreSwell
 */

import type { InventoryItem } from "@repo/types"
import {
  isMediaConditionDegraded,
  isMediaConditionImproved,
  readItemCondition,
} from "@repo/types"
import { getCurrentUser } from "../actors/authActor"
import { getUserInventory } from "../actors/userGameStateActor"
import { subscribeById } from "../actors/socketActor"
import { isGameEventForUser } from "./gameEventRelevance"
import { playInventoryItemAnimation } from "./inventoryItemAnimations"

/** Budget for the collection row to mount after conversion restore. */
export const RESTORE_ACQUIRED_WAIT_FOR_DOM_MS = 400

type InventoryUpdatedData = {
  userId?: string
  item?: InventoryItem
}

type InventoryRemovedData = {
  userId?: string
  itemId?: string
  degraded?: boolean
}

type InventoryAcquiredData = {
  userId?: string
  item?: InventoryItem
  restored?: boolean
}

let subscribed = false

export function bindPhysicalMediaConditionFx(): void {
  if (subscribed) return
  subscribed = true
  subscribeById("physical-media-condition-fx", {
    eventTypes: ["INVENTORY_ITEM_UPDATED", "INVENTORY_ITEM_REMOVED", "INVENTORY_ITEM_ACQUIRED"],
    send: (event: {
      type?: string
      data?: InventoryUpdatedData & InventoryRemovedData & InventoryAcquiredData
    }) => {
      if (!isGameEventForUser(event.data, getCurrentUser()?.userId)) return

      if (event.type === "INVENTORY_ITEM_UPDATED") {
        const item = event.data?.item
        if (!item?.itemId) return
        const prev = getUserInventory()?.items.find((row) => row.itemId === item.itemId)
        if (!prev) return
        const prevCondition = readItemCondition(prev)
        const nextCondition = readItemCondition(item)
        if (isMediaConditionDegraded(prevCondition, nextCondition)) {
          void playInventoryItemAnimation(item.itemId, "headShake")
          return
        }
        if (isMediaConditionImproved(prevCondition, nextCondition)) {
          void playInventoryItemAnimation(item.itemId, "restoreSwell")
        }
        return
      }

      if (event.type === "INVENTORY_ITEM_REMOVED" && event.data?.degraded && event.data.itemId) {
        void playInventoryItemAnimation(event.data.itemId, "headShake")
        return
      }

      if (event.type === "INVENTORY_ITEM_ACQUIRED" && event.data?.restored) {
        const itemId = event.data.item?.itemId
        if (!itemId) return
        void playInventoryItemAnimation(itemId, "restoreSwell", {
          waitForDomMs: RESTORE_ACQUIRED_WAIT_FOR_DOM_MS,
        })
      }
    },
  })
}

/** @deprecated Prefer {@link bindPhysicalMediaConditionFx}. */
export function bindPhysicalMediaDegradeShake(): void {
  bindPhysicalMediaConditionFx()
}
