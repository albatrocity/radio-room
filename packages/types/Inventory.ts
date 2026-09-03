import type { GameStateModifier } from "./GameSession"
import type { ItemRarity } from "./ShoppingSession"
import type { LucideIconName } from "./LucideIconKey"

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
// Defense items (passive, held in inventory)
// ============================================================================

/**
 * What incoming actions a defense item can intercept. `queue` uses the same
 * intent vocabulary as effects: demotion (delta &gt; 0) is `negative`, promotion
 * (delta &lt; 0) is `positive`.
 */
export type DefenseScope = "modifier" | "queue"

/**
 * Specifies what a defense item blocks. Constraints are AND-combined where
 * applicable; entire modifiers are blocked if any effect matches (when
 * per-effect filters are present). Enforced in `DefenseService` on the server.
 */
export interface DefenseTargeting {
  /** Block effects with these flag names (e.g. chat text flags). */
  flagNames?: string[]
  /** Block effects with these intents, or queue moves of this intent. */
  intents?: ("positive" | "negative" | "neutral")[]
  /** Block modifiers whose `GameStateModifier.source` is in this list. */
  sourcePlugins?: string[]
  /** Block modifiers whose `itemDefinitionId` is in this list. */
  sourceItemDefinitionIds?: string[]
  /** Block any modifier (ignore per-effect targeting). */
  blockAllModifiers?: boolean
}

export interface DefenseSpec {
  targeting: DefenseTargeting
  /** Which subsystems this item defends in. */
  scope: DefenseScope[]
  /**
   * Documented “charges” per design; consumption is implemented via stack
   * `quantity` (one block removes one from the stack).
   */
  charges?: number
}

// ============================================================================
// Item definitions
// ============================================================================

/**
 * CSS/SVG overlay token for Physical Media cover art (ADR 0099). Derived from
 * the Navidrome playlist prefix only — never inferred from display name/icon.
 */
export type ArtworkFrame = "jewel-case" | "record-jacket" | "die-cut-jacket" | "cassette-case"

export const ARTWORK_FRAMES: readonly ArtworkFrame[] = [
  "jewel-case",
  "record-jacket",
  "die-cut-jacket",
  "cassette-case",
] as const

export function isArtworkFrame(value: string): value is ArtworkFrame {
  return parseArtworkFrame(value) != null
}

/** Normalize a wire/token value, including the retired `"j-card"` alias. */
export function parseArtworkFrame(value: string): ArtworkFrame | undefined {
  const trimmed = value.trim()
  if (trimmed === "j-card") return "cassette-case"
  if ((ARTWORK_FRAMES as readonly string[]).includes(trimmed)) return trimmed as ArtworkFrame
  return undefined
}

/** pluginData payload Item Shops attaches on Local tracks that live on a derived record. */
export type PhysicalMediaNowPlayingFrame = {
  /** ~384px playlist cover when Navidrome has one; omitted so the client can fall back to track art. */
  imageUrl?: string
  /** ~1200px playlist cover for feature-sized display (Now Playing). */
  imageUrlLarge?: string
  artworkFrame: ArtworkFrame
}

/** Hosted playlist-sleeve URLs from `PluginAPI.getLocalPlaylistArtwork` (ADR 0099). */
export type LocalPlaylistArtwork = {
  imageUrl?: string
  imageUrlLarge?: string
}

export const PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY = "physicalMediaFrame" as const

/**
 * Opt-in Game State item detail (ADR 0104). Presence shows a Details secondary
 * action; `layout` chooses the built-in detail body.
 */
export type ItemDetailViewLayout = "default" | "trackList"

export type ItemDetailView = {
  /** Button label; default "Details". Also used as tooltip when `iconOnly`. */
  actionLabel?: string
  /** Optional Lucide icon on the Details button (PascalCase name). */
  actionIcon?: LucideIconName
  /**
   * When `true` with `actionIcon`, render an icon-only control; tooltip uses
   * `actionLabel` (or "Details").
   */
  iconOnly?: boolean
  /**
   * `default` — name, large artwork/icon, full description.
   * `trackList` — default plus a track list keyed by `mediaKey` on the nav frame.
   */
  layout?: ItemDetailViewLayout
}

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
  /**
   * Optional artist line shown under `name` (Physical Media album/playlist
   * SKUs). Omitted for items that are not records.
   */
  artist?: string
  /** Optional emoji or icon name surfaced by the UI. */
  icon?: LucideIconName
  /**
   * Artwork URL rendered instead of `icon` when present (e.g. Physical Media
   * cover art served from the room image store — ADR 0099). Row-sized (~384px).
   */
  imageUrl?: string
  /** Feature-sized (~1200px) cover for Now Playing; falls back to `imageUrl`. */
  imageUrlLarge?: string
  /** Physical Media presentation overlay when `imageUrl` is present (ADR 0099). */
  artworkFrame?: ArtworkFrame
  /**
   * When set, Inventory / shop UIs show a Details action that opens the Game
   * State item detail subroute (ADR 0104).
   */
  detailView?: ItemDetailView

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
   * Which session slot pool this item occupies. `"inventory"` (default) is the
   * consumable/tool bag; `"collection"` is durable holdings (Physical Media).
   */
  slotPool?: "inventory" | "collection"
  /**
   * When `"user"`, the inventory UI opens a target picker and sends `targetUserId`
   * with `USE_INVENTORY_ITEM`; plugins read it from `onItemUsed` `callContext`.
   * When `"queueItem"`, the inventory UI opens a queue picker and sends `targetQueueItemId`
   * (metadata track id) with `USE_INVENTORY_ITEM`.
   * When `"userInventoryItem"`, the UI picks a user, peeks their inventory
   * (`PEEK_USER_INVENTORY`), then sends `targetUserId` + `targetInventoryItemId`
   * (see ADR 0147).
   * When `"self"` or omitted, the effect applies to the inventory owner only.
   */
  requiresTarget?:
    | "self"
    | "user"
    | "queueItem"
    | "inventoryItem"
    | "userInventoryItem"
    | "coinAmount"
  /**
   * When set, holding this item passively blocks matching modifiers / queue
   * moves; one block consumes one from stack `quantity`.
   */
  defense?: DefenseSpec
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
  /** Plugin-computed sellback coins (overrides shop buyback rate). Set only on wire payloads (e.g. USER_GAME_STATE). */
  sellbackValue?: number
  /** Plugin-specific metadata (kept opaque to core). */
  metadata?: Record<string, unknown>
}

export interface UserInventory {
  userId: string
  items: InventoryItem[]
  /** Effective slot cap for this session (mirrors `GameSessionConfig.maxInventorySlots`). */
  maxSlots: number
  /** Effective collection slot cap (mirrors `GameSessionConfig.maxCollectionSlots`). */
  maxCollectionSlots: number
}

/**
 * One stack in a `USER_INVENTORY_PEEK_RESULT` payload (ADR 0147).
 * Public catalog fields only — no stack `metadata`.
 */
export interface UserInventoryPeekItem {
  itemId: string
  definitionId: string
  quantity: number
  name: string
  shortId: string
  icon?: string
  imageUrl?: string
  artworkFrame?: ArtworkFrame
  rarity?: ItemRarity
  tradeable: boolean
  slotPool: "inventory" | "collection"
}

/** Same-socket reply for `PEEK_USER_INVENTORY`. */
export interface UserInventoryPeekResult {
  success: boolean
  message?: string
  targetUserId?: string
  items?: UserInventoryPeekItem[]
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
  /** Optional toast/alert title (defaults to "Success", "Error", or auto-detected from message). */
  title?: string
  /** Optional user-facing feedback (toast / chat alert body). */
  message?: string
}

/**
 * Payload for `RoomPlugin.onDefenseTriggered` after core has matched and
 * consumed one quantity from a passive defense stack (`modifier` or `queue`
 * scope). Optional fields depend on what the server knows about the initiator.
 */
export interface DefenseTriggeredPayload {
  roomId: string
  defenderUserId: string
  /** User who applied the modifier or queue action, when known. */
  attackerUserId?: string
  /** Item whose effect was blocked, when the modifier carried `itemDefinitionId`. */
  attackerItemDefinition?: ItemDefinition
  defenseItemDefinition: ItemDefinition
  /**
   * When a **modifier** defense blocked this application: the modifier that
   * would have been applied (no `id` / `source`). Plugins may re-apply it to
   * another user (e.g. Rubber Band) using `applyTimedModifier` with
   * `skipPassiveDefenseCheck` to avoid recursion.
   */
  blockedModifier?: Omit<GameStateModifier, "id" | "source">
}

/**
 * Optional overrides for default defense messaging. Omitted fields use core
 * defaults (`GAME_EFFECT_BLOCKED` room line, attacker-facing copy from
 * `ApplyModifierResult` / `MoveTrackResult`).
 */
export interface DefenseTriggeredResult {
  attackerMessage?: string
  roomMessage?: string
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
export type InventoryAcquisitionSource =
  | "plugin"
  | "trade"
  | "gift"
  | "purchase"
  | "admin"
  | "defense_intercept"
