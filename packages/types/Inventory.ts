import type { ItemRarity } from "./ShoppingSession"

/**
 * Inventory Types
 *
 * Inventory is core infrastructure (not a plugin) so that:
 * - Cross-plugin items work out of the box (e.g. Guess the Tune awards a
 *   "Speed Potion" defined by Potion Shop).
 * - Trading / marketplace flows have a single authority for ownership.
 * - The frontend can render one inventory panel regardless of source plugin.
 * - Per-session limits (`maxInventorySlots`) are enforced uniformly.
 */

// ============================================================================
// Item definitions
// ============================================================================

/**
 * Static definition of an item kind, registered by the owning plugin during
 * `register()`. The `id` is namespaced as `<plugin-name>:<short-id>`.
 */
export interface ItemDefinition {
  /** Fully-qualified id, e.g. `"potion-shop:speed-potion"`. */
  id: string
  /** Plugin that owns the definition (and implements `onItemUsed`). */
  sourcePlugin: string
  /** Short id within the plugin (`"speed-potion"`). */
  shortId: string

  name: string
  description: string
  /** Optional emoji or icon name surfaced by the UI. */
  icon?: string

  /** When `true`, multiple acquisitions combine into a single stack. */
  stackable: boolean
  /** Cap on quantity per stack. Ignored when `stackable: false`. */
  maxStack: number
  /** Whether users can transfer this item to another user. */
  tradeable: boolean
  /** Whether the item is consumed on use. */
  consumable: boolean
  /** Optional base coin value when sold via the inventory API. */
  coinValue?: number
  /**
   * Weighted shop sampling / UX (e.g. item shops). Undefined means `"common"`.
   */
  rarity?: ItemRarity
  /**
   * When `"user"`, the inventory UI opens a target picker and sends `targetUserId`
   * with `USE_INVENTORY_ITEM`; plugins read it from `onItemUsed` `callContext`.
   * When `"queueItem"`, the inventory UI opens a queue picker and sends `targetQueueItemId`
   * (metadata track id) with `USE_INVENTORY_ITEM`.
   * When `"self"` or omitted, the effect applies to the inventory owner only.
   */
  requiresTarget?: "self" | "user" | "queueItem"
}

// ============================================================================
// Item instances
// ============================================================================

export interface InventoryItem {
  /** Unique instance id (uuid-style hex). */
  itemId: string
  /** Reference to the `ItemDefinition.id`. */
  definitionId: string
  /** Plugin that defined this item (denormalised for O(1) routing). */
  sourcePlugin: string
  /** Quantity (always >= 1; 0 results in deletion). */
  quantity: number
  /** Unix epoch (ms) when the user acquired the (top of the) stack. */
  acquiredAt: number
  /** Plugin-specific metadata (kept opaque to core). */
  metadata?: Record<string, unknown>
}

export interface UserInventory {
  userId: string
  items: InventoryItem[]
  /** Effective slot cap for this session (mirrors `GameSessionConfig.maxInventorySlots`). */
  maxSlots: number
}

// ============================================================================
// Item usage
// ============================================================================

/**
 * Returned by a plugin's `onItemUsed` handler. The core inventory service
 * decrements quantity when `consumed: true`.
 */
export interface ItemUseResult {
  success: boolean
  /** When `true`, the core decrements quantity by 1 (and removes empty stacks). */
  consumed: boolean
  /** Optional user-facing feedback (toast / chat alert). */
  message?: string
}

/**
 * Returned by a plugin's `onItemSold` handler. The plugin is responsible
 * for removing the item from inventory and crediting the user; this result
 * is purely informational.
 */
export interface ItemSellResult {
  success: boolean
  /** Optional user-facing feedback (toast / chat alert). */
  message?: string
  /** Coins refunded to the user. */
  refund?: number
}

/** Source attribution for `INVENTORY_ITEM_ACQUIRED`. */
export type InventoryAcquisitionSource = "plugin" | "trade" | "purchase" | "admin"
