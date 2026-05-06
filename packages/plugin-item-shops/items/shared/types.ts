import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import type {
  ItemDefinition,
  ItemUseResult,
  PluginContext,
  GameSessionPluginAPI,
} from "@repo/types"

/**
 * Dependencies passed into every item-use behavior (room API, game API, config snapshot).
 */
export type ItemShopsBehaviorDeps = {
  pluginName: string
  context: PluginContext
  game: GameSessionPluginAPI
  effectDurationMs: number
}

export type ItemUseHandler = (
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
) => Promise<ItemUseResult>

/** Registered item: catalog slice plus optional activation handler. */
export type Item<TShortId extends string = string> = {
  readonly shortId: TShortId
  readonly catalogEntry: ItemCatalogEntry
  readonly use?: ItemUseHandler
}

/** Definition fields without `shortId` — `createItem` injects it from `shortId`. */
export type ItemDefinitionInput = Omit<ItemCatalogEntry["definition"], "shortId">

/**
 * Create an item with its catalog entry and optional use handler.
 *
 * @example
 * ```ts
 * export const boostPedal = createItem({
 *   shortId: "boost-pedal",
 *   definition: { name: "Boost Pedal", icon: "chevrons-up", ... },
 *   use: timedModifierEffect({ ... }),
 * })
 * ```
 */
export function createItem<TShortId extends string>(config: {
  /** Unique identifier used in shops and inventory. */
  shortId: TShortId
  /** Item properties (name, description, icon, rarity, etc). */
  definition: ItemDefinitionInput
  /**
   * Called when a user activates this item from inventory.
   * Omit for passive/defense items that only apply via game rules.
   * Use `timedModifierEffect()` for pedal-style timed chat modifiers.
   */
  use?: ItemUseHandler
}): Item<TShortId> {
  return {
    shortId: config.shortId,
    catalogEntry: {
      definition: { shortId: config.shortId, ...config.definition },
    },
    use: config.use,
  }
}
