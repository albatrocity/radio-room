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
  tokenizeWords,
  buildSegments,
  type TokenizedWord,
} from "./helpers"

export {
  ShopPlugin,
  type ShopStockChangedPayload,
  type ShopPurchaseCompletePayload,
  type ShopSaleCompletePayload,
} from "./ShopPlugin"
