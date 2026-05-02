import {
  AppContext,
  InventoryAcquisitionSource,
  InventoryItem,
  ItemDefinition,
  ItemUseResult,
  UserInventory,
} from "@repo/types"
import generateId from "../lib/generateId"
import { GameSessionService } from "./GameSessionService"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_SLOTS = 3

// ============================================================================
// Redis key helpers
// ============================================================================

/**
 * Inventory keys are scoped to room (sessions live and die with rooms but
 * inventory persists across sessions until the room is deleted, so it lives
 * here rather than under `:game:session:{id}`).
 *
 *   room:{roomId}:inventory:items:{userId} -> HASH itemId -> JSON InventoryItem
 *   room:{roomId}:inventory:definitions     -> HASH definitionId -> JSON ItemDefinition
 */
function userItemsKey(roomId: string, userId: string): string {
  return `room:${roomId}:inventory:items:${userId}`
}
function definitionsKey(roomId: string): string {
  return `room:${roomId}:inventory:definitions`
}

// ============================================================================
// InventoryService
// ============================================================================

/**
 * InventoryService manages item definitions and per-user inventories.
 *
 * Plugins register `ItemDefinition`s once during `register()`; instances are
 * stored as `InventoryItem`s under each user's inventory hash. The service
 * mediates trade and use, calling back into the source plugin's `onItemUsed`
 * via `PluginRegistry`.
 */
export class InventoryService {
  constructor(private readonly context: AppContext) {}

  // ==========================================================================
  // Item definitions
  // ==========================================================================

  async registerItemDefinitions(
    roomId: string,
    sourcePlugin: string,
    definitions: Array<Omit<ItemDefinition, "id" | "sourcePlugin">>,
  ): Promise<void> {
    if (definitions.length === 0) return

    const fields: Record<string, string> = {}
    for (const partial of definitions) {
      const def: ItemDefinition = {
        ...partial,
        id: `${sourcePlugin}:${partial.shortId}`,
        sourcePlugin,
      }
      fields[def.id] = JSON.stringify(def)
    }
    await this.context.redis.pubClient.hSet(definitionsKey(roomId), fields)
  }

  async getItemDefinition(roomId: string, definitionId: string): Promise<ItemDefinition | null> {
    const raw = await this.context.redis.pubClient.hGet(definitionsKey(roomId), definitionId)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ItemDefinition
    } catch {
      return null
    }
  }

  async getAllItemDefinitions(roomId: string): Promise<ItemDefinition[]> {
    const all = await this.context.redis.pubClient.hGetAll(definitionsKey(roomId))
    const out: ItemDefinition[] = []
    for (const v of Object.values(all)) {
      try {
        out.push(JSON.parse(v) as ItemDefinition)
      } catch {
        // skip
      }
    }
    return out
  }

  // ==========================================================================
  // Reads
  // ==========================================================================

  async getInventory(roomId: string, userId: string): Promise<UserInventory> {
    const all = await this.context.redis.pubClient.hGetAll(userItemsKey(roomId, userId))
    const items: InventoryItem[] = []
    for (const v of Object.values(all)) {
      try {
        items.push(JSON.parse(v) as InventoryItem)
      } catch {
        // skip
      }
    }

    const maxSlots = await this.resolveMaxSlots(roomId)
    return { userId, items, maxSlots }
  }

  async hasItem(
    roomId: string,
    userId: string,
    definitionId: string,
    minQuantity = 1,
  ): Promise<boolean> {
    const inv = await this.getInventory(roomId, userId)
    let total = 0
    for (const item of inv.items) {
      if (item.definitionId === definitionId) {
        total += item.quantity
        if (total >= minQuantity) return true
      }
    }
    return false
  }

  // ==========================================================================
  // Mutations
  // ==========================================================================

  /**
   * Award `quantity` of an item to `userId`. If the definition is stackable
   * and an existing stack has room, the quantity is merged; otherwise a new
   * `InventoryItem` instance is created.
   *
   * Resolves to the (possibly merged) `InventoryItem` or `null` when the
   * inventory is full / definition is unknown.
   */
  async giveItem(
    roomId: string,
    userId: string,
    definitionId: string,
    quantity = 1,
    metadata?: Record<string, unknown>,
    source: InventoryAcquisitionSource = "plugin",
  ): Promise<InventoryItem | null> {
    if (quantity <= 0) return null

    const definition = await this.getItemDefinition(roomId, definitionId)
    if (!definition) {
      console.warn(`[InventoryService] giveItem: unknown definition ${definitionId}`)
      return null
    }

    const inv = await this.getInventory(roomId, userId)

    // Prefer merging into an existing stack when stackable.
    if (definition.stackable) {
      const existing = inv.items.find(
        (i) => i.definitionId === definitionId && i.quantity < definition.maxStack,
      )
      if (existing) {
        const room = definition.maxStack - existing.quantity
        const toAdd = Math.min(room, quantity)
        existing.quantity += toAdd
        await this.persistItem(roomId, userId, existing)

        if (this.context.systemEvents) {
          await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_ACQUIRED", {
            roomId,
            sessionId: await this.activeSessionId(roomId),
            userId,
            item: existing,
            source,
          })
        }

        await this.bumpSessionTotal(roomId, "itemsAcquired", toAdd)

        const remaining = quantity - toAdd
        if (remaining > 0) {
          // Recurse to allocate the remainder into a new stack.
          return this.giveItem(roomId, userId, definitionId, remaining, metadata, source)
        }
        return existing
      }
    }

    // Need to allocate a new slot.
    if (inv.items.length >= inv.maxSlots) {
      console.warn(`[InventoryService] giveItem: ${userId} inventory full (${inv.maxSlots} slots)`)
      return null
    }

    const item: InventoryItem = {
      itemId: generateId(),
      definitionId,
      sourcePlugin: definition.sourcePlugin,
      quantity: definition.stackable ? Math.min(quantity, definition.maxStack) : 1,
      acquiredAt: Date.now(),
      metadata,
    }
    await this.persistItem(roomId, userId, item)

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_ACQUIRED", {
        roomId,
        sessionId: await this.activeSessionId(roomId),
        userId,
        item,
        source,
      })
    }

    await this.bumpSessionTotal(roomId, "itemsAcquired", item.quantity)

    // For non-stackable items, we award `quantity` separate instances.
    if (!definition.stackable && quantity > 1) {
      await this.giveItem(roomId, userId, definitionId, quantity - 1, metadata, source)
    }
    // For stackable items where quantity exceeded the new stack's cap.
    if (definition.stackable && quantity > item.quantity) {
      await this.giveItem(roomId, userId, definitionId, quantity - item.quantity, metadata, source)
    }

    return item
  }

  /**
   * Remove `quantity` (default 1) from an item stack. Empty stacks are deleted.
   * Returns whether anything was removed.
   */
  async removeItem(roomId: string, userId: string, itemId: string, quantity = 1): Promise<boolean> {
    if (quantity <= 0) return false

    const raw = await this.context.redis.pubClient.hGet(userItemsKey(roomId, userId), itemId)
    if (!raw) return false

    let item: InventoryItem
    try {
      item = JSON.parse(raw) as InventoryItem
    } catch {
      return false
    }

    const removeQty = Math.min(quantity, item.quantity)
    item.quantity -= removeQty

    if (item.quantity <= 0) {
      await this.context.redis.pubClient.hDel(userItemsKey(roomId, userId), itemId)
    } else {
      await this.persistItem(roomId, userId, item)
    }

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_REMOVED", {
        roomId,
        sessionId: await this.activeSessionId(roomId),
        userId,
        itemId,
        quantity: removeQty,
      })
    }

    return true
  }

  /**
   * Move `quantity` of an item from one user to another. Honours
   * `ItemDefinition.tradeable` and the active session's `allowTrading` flag.
   *
   * Resolves to `false` if the trade was not allowed or the source user does
   * not own enough of the item.
   */
  async transferItem(
    roomId: string,
    fromUserId: string,
    toUserId: string,
    itemId: string,
    quantity = 1,
  ): Promise<boolean> {
    if (quantity <= 0) return false

    const allow = await this.assertTradingAllowed(roomId)
    if (!allow) return false

    const raw = await this.context.redis.pubClient.hGet(userItemsKey(roomId, fromUserId), itemId)
    if (!raw) return false

    let item: InventoryItem
    try {
      item = JSON.parse(raw) as InventoryItem
    } catch {
      return false
    }

    const def = await this.getItemDefinition(roomId, item.definitionId)
    if (!def?.tradeable) return false

    const transferQty = Math.min(quantity, item.quantity)
    if (transferQty <= 0) return false

    // Decrement / delete on the source side.
    item.quantity -= transferQty
    if (item.quantity <= 0) {
      await this.context.redis.pubClient.hDel(userItemsKey(roomId, fromUserId), itemId)
    } else {
      await this.persistItem(roomId, fromUserId, item)
    }

    // Award on the destination side via giveItem (handles stacking + slot limits).
    const transferred = await this.giveItem(
      roomId,
      toUserId,
      item.definitionId,
      transferQty,
      item.metadata,
      "trade",
    )

    if (!transferred) {
      // Recipient inventory full — refund the sender.
      await this.giveItem(
        roomId,
        fromUserId,
        item.definitionId,
        transferQty,
        item.metadata,
        "trade",
      )
      return false
    }

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_TRANSFERRED", {
        roomId,
        sessionId: await this.activeSessionId(roomId),
        fromUserId,
        toUserId,
        item: transferred,
        quantity: transferQty,
      })
    }

    await this.bumpSessionTotal(roomId, "itemsTraded", transferQty)

    return true
  }

  /**
   * Use an item: validates ownership, looks up the source plugin, dispatches
   * to its `onItemUsed`, and decrements quantity if the result is consumed.
   *
   * Returns the result from the plugin (or a default failure result if the
   * plugin / item isn't usable).
   */
  async useItem(
    roomId: string,
    userId: string,
    itemId: string,
    callContext?: unknown,
  ): Promise<ItemUseResult> {
    const raw = await this.context.redis.pubClient.hGet(userItemsKey(roomId, userId), itemId)
    if (!raw) {
      return { success: false, consumed: false, message: "Item not found in inventory" }
    }

    let item: InventoryItem
    try {
      item = JSON.parse(raw) as InventoryItem
    } catch {
      return { success: false, consumed: false, message: "Item data corrupted" }
    }

    const def = await this.getItemDefinition(roomId, item.definitionId)
    if (!def) {
      return { success: false, consumed: false, message: "Item definition not found" }
    }

    const result = await this.dispatchUseToPlugin(roomId, userId, item, def, callContext)

    if (result.consumed) {
      await this.removeItem(roomId, userId, itemId, 1)
      await this.bumpSessionTotal(roomId, "itemsUsed", 1)
    }

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_USED", {
        roomId,
        sessionId: await this.activeSessionId(roomId),
        userId,
        item,
        result,
      })
    }

    return result
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /** Clear all inventory state for a room (called on room delete). */
  async cleanupRoom(roomId: string): Promise<void> {
    try {
      const pattern = `room:${roomId}:inventory:*`
      const keys = await this.context.redis.pubClient.keys(pattern)
      if (keys.length > 0) {
        await this.context.redis.pubClient.del(keys)
      }
    } catch (error) {
      console.error("[InventoryService] cleanupRoom failed:", error)
    }
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  private async persistItem(roomId: string, userId: string, item: InventoryItem): Promise<void> {
    await this.context.redis.pubClient.hSet(
      userItemsKey(roomId, userId),
      item.itemId,
      JSON.stringify(item),
    )
  }

  private async resolveMaxSlots(roomId: string): Promise<number> {
    if (!this.context.gameSessions) return DEFAULT_MAX_SLOTS
    const session = await this.context.gameSessions.getActiveSession(roomId)
    return session?.config.maxInventorySlots ?? DEFAULT_MAX_SLOTS
  }

  private async assertTradingAllowed(roomId: string): Promise<boolean> {
    if (!this.context.gameSessions) return false
    const session = await this.context.gameSessions.getActiveSession(roomId)
    if (!session) return false
    return session.config.allowTrading === true
  }

  private async activeSessionId(roomId: string): Promise<string> {
    if (!this.context.gameSessions) return ""
    const session = await this.context.gameSessions.getActiveSession(roomId)
    return session?.id ?? ""
  }

  private async bumpSessionTotal(
    roomId: string,
    field: "itemsAcquired" | "itemsUsed" | "itemsTraded",
    by: number,
  ): Promise<void> {
    const svc = this.context.gameSessions as GameSessionService | undefined
    if (!svc) return
    await svc.incrementSessionTotal(roomId, field, by).catch((err) => {
      console.error("[InventoryService] bumpSessionTotal failed:", err)
    })
  }

  /**
   * Look up the source plugin and call its `onItemUsed`. Falls back to a
   * default failure result if the plugin isn't loaded for the room or doesn't
   * implement the handler.
   */
  private async dispatchUseToPlugin(
    roomId: string,
    userId: string,
    item: InventoryItem,
    definition: ItemDefinition,
    callContext: unknown,
  ): Promise<ItemUseResult> {
    const registry = this.context.pluginRegistry as
      | {
          invokeOnItemUsed?: (
            roomId: string,
            pluginName: string,
            userId: string,
            item: InventoryItem,
            definition: ItemDefinition,
            callContext: unknown,
          ) => Promise<ItemUseResult | null>
        }
      | undefined

    if (!registry?.invokeOnItemUsed) {
      return { success: false, consumed: false, message: "No plugin registry available" }
    }

    const result = await registry.invokeOnItemUsed(
      roomId,
      definition.sourcePlugin,
      userId,
      item,
      definition,
      callContext,
    )
    if (!result) {
      return {
        success: false,
        consumed: false,
        message: `${definition.sourcePlugin} does not handle item use`,
      }
    }
    return result
  }
}
