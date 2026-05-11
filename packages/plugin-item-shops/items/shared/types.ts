import type { TextEffectKind } from "@repo/plugin-base"
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
}

export type ItemUseHandler = (
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
) => Promise<ItemUseResult>

/** Registered item: catalog slice, optional activation handler, optional chat text-effect kind. */
export type Item<TShortId extends string = string> = {
  readonly shortId: TShortId
  readonly catalogEntry: ItemCatalogEntry
  readonly use?: ItemUseHandler
  /** Chat-message text effect declaration owned by this item; aggregated into `TEXT_EFFECT_KINDS`. */
  readonly textEffect?: TextEffectKind
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
 *   definition: { name: "Boost Pedal", icon: "ChevronsUp", ... },
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
  /**
   * Optional chat-message text effect that activates while this item's flag is set on the user.
   * `TEXT_EFFECT_KINDS` in `items/index.ts` collects these automatically.
   */
  textEffect?: TextEffectKind
}): Item<TShortId> {
  return {
    shortId: config.shortId,
    catalogEntry: {
      definition: { shortId: config.shortId, ...config.definition },
    },
    use: config.use,
    textEffect: config.textEffect,
  }
}
