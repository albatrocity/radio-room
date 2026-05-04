// ============================================================================
// BasePlugin and timer utilities
// (Lives in `./BasePlugin.ts` so that `./ShopPlugin.ts` can import it without
// going through this barrel file, which would cause a load-order cycle.)
// ============================================================================

export { BasePlugin, type Timer, type TimerConfig } from "./BasePlugin"

// ============================================================================
// Composable helpers (importable directly from `@repo/plugin-base/helpers`).
// Re-exported here for convenience.
// ============================================================================

export {
  ShopHelper,
  buildShopItemsFromCatalog,
  shopStockStoreKey,
  shopBuyAction,
  type ShopCatalogEntry,
  type ShopItem,
  type ShopTransactionResult,
  type GenerateShopComponentsOptions,
  ShoppingSessionHelper,
  type ItemShopsShopCatalogEntry,
  type ShopAvailableItem,
  type ItemCatalogEntry,
  resolveItemRarity,
  resolveShopItemPrice,
  resolveUnlistedSellBasePrice,
  isShopListedItem,
  buildItemCatalogMap,
  DEFAULT_RARITY_WEIGHTS,
  tokenizeWords,
  buildSegments,
  type TokenizedWord,
  SHRINK_FLAG,
  GROW_FLAG,
  ECHO_FLAG,
  GATE_FLAG,
  SCRAMBLE_FLAG,
  countTextEffectStacks,
  netSizeShift,
  resolveBaseSize,
  resolveEchoSize,
  echoCount,
  applyGateTransform,
  applyScrambleTransform,
  applyTextEffects,
  type TextEffectStacks,
  type AppliedTextEffects,
} from "./helpers"

export {
  ShopPlugin,
  type ShopStockChangedPayload,
  type ShopPurchaseCompletePayload,
  type ShopSaleCompletePayload,
} from "./ShopPlugin"
