import type {
  InventoryItem,
  ItemDefinition,
  ItemSellResult,
  PluginActionInitiator,
  PluginComponentState,
  PluginContext,
  SystemEventPayload,
} from "@repo/types"
import { BasePlugin } from "./BasePlugin"
import { ShopHelper, type ShopItem, type ShopTransactionResult } from "./helpers/ShopHelper"

/**
 * Standard payload for `STOCK_CHANGED` events emitted by `ShopPlugin`.
 *
 * Includes one numeric stock entry per registered item (keyed via
 * `shopStockStoreKey`) plus a `sellPrice` quote for `defaultSellQuoteShortId`.
 */
export type ShopStockChangedPayload = Record<string, number> & { sellPrice: number }

/**
 * Standard payload for `PURCHASE_COMPLETE` events emitted by `ShopPlugin`.
 */
export type ShopPurchaseCompletePayload = {
  userId: string
  username: string
  /** Item `shortId` purchased. */
  item: string
  price: number
  /** Stock for `defaultSellQuoteShortId` after the purchase, for live UI updates. */
  stock: number
  /** Sell-back quote for `defaultSellQuoteShortId`. */
  sellPrice: number
}

/**
 * Standard payload for `SALE_COMPLETE` events emitted by `ShopPlugin`.
 */
export type ShopSaleCompletePayload = {
  userId: string
  username: string
  /** Item `shortId` sold back. */
  item: string
  refund: number
  /** Stock for `defaultSellQuoteShortId` after the sale. */
  stock: number
  /** Sell-back quote for `defaultSellQuoteShortId`. */
  sellPrice: number
}

/**
 * Abstract base class for shop plugins. Extends `BasePlugin` and composes
 * `ShopHelper` to provide standard buy / sell / restock orchestration:
 *
 * - Registers shop items with the inventory system on `register()`.
 * - Restocks on `GAME_SESSION_STARTED`.
 * - Routes plugin actions matching `matchBuyAction` to `purchaseCatalogItem`
 *   and the `"restock"` action to `restockAll`.
 * - Implements `onItemSold` by delegating to `ShopHelper.sell`.
 * - Emits standard `PURCHASE_COMPLETE`, `SALE_COMPLETE`, and `STOCK_CHANGED`
 *   events and posts purchase / sale system messages.
 *
 * Subclasses provide the catalog (`shopItems`) and config guards
 * (`isShopEnabled`, `isSellingItems`), and may override the optional
 * `onPurchaseComplete` / `onSaleComplete` hooks for item-specific side
 * effects. They retain full control over `onItemUsed` and other plugin
 * lifecycle hooks.
 *
 * Plugins that need finer-grained control (e.g. a plugin that is both a
 * shop and a game) can ignore this base class and compose `ShopHelper`
 * directly from `BasePlugin`.
 *
 * @example
 * ```typescript
 * class MusicShopPlugin extends ShopPlugin<MusicShopConfig> {
 *   name = "music-shop"
 *   version = "1.0.0"
 *   shopItems = buildMusicShopItems()
 *   defaultSellQuoteShortId = "skip-token"
 *
 *   isShopEnabled(c: MusicShopConfig) { return c.enabled }
 *   isSellingItems(c: MusicShopConfig) { return c.isSellingItems }
 *
 *   async onItemUsed(...) { ... }
 * }
 * ```
 */
export abstract class ShopPlugin<TConfig = any> extends BasePlugin<TConfig> {
  /** Shop catalog. Subclasses must provide this. */
  protected abstract shopItems: ShopItem[]

  /**
   * Item `shortId` whose stock and sell-back quote are bundled into
   * `STOCK_CHANGED` / `PURCHASE_COMPLETE` / `SALE_COMPLETE` payloads. Defaults
   * to the first item in `shopItems`.
   */
  protected defaultSellQuoteShortId?: string

  /**
   * Action prefix used by `ShopHelper.matchBuyAction`. Defaults to `"buy"`
   * (so `skip-token` is bought via `"buySkipToken"`).
   */
  protected buyActionPrefix?: string

  /**
   * Admin action id that triggers a full restock. Defaults to `"restock"`.
   * Set to `null` to disable the built-in admin restock flow.
   */
  protected restockActionId: string | null = "restock"

  /** Composed shop helper. Available after `register()`. */
  protected shop!: ShopHelper

  /**
   * Whether the plugin is enabled at all. When `false`, all buy/sell flows
   * are blocked and the closed-shop messages are returned.
   */
  protected abstract isShopEnabled(config: TConfig): boolean

  /**
   * Whether the shop is actively selling items. When `false`, `onItemUsed`
   * and `onItemSold` still work but new purchases are blocked. Mirrors the
   * `isSellingItems` config convention from ADR 0041.
   */
  protected abstract isSellingItems(config: TConfig): boolean

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.shop = new ShopHelper(this.name, context, this.shopItems)
    this.shop.registerItems()
    this.on("GAME_SESSION_STARTED", this.handleGameSessionStarted.bind(this))
  }

  private async handleGameSessionStarted(
    _data: SystemEventPayload<"GAME_SESSION_STARTED">,
  ): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config || !this.isShopEnabled(config)) return
    await this.shop.restockAll()
    await this.emitStockChanged()
  }

  // ==========================================================================
  // Component state
  // ==========================================================================

  async getComponentState(): Promise<PluginComponentState> {
    if (!this.context) return {}
    return this.shop.getComponentStateWithSellPrice(this.getDefaultSellQuoteShortId())
  }

  // ==========================================================================
  // Plugin actions
  // ==========================================================================

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    const buyShortId = this.shop?.matchBuyAction(action, this.buyActionPrefix)
    if (buyShortId) {
      return this.buyCatalogItem(initiator, buyShortId)
    }
    if (this.restockActionId && action === this.restockActionId) {
      return this.adminRestock()
    }
    return super.executeAction(action, initiator)
  }

  /**
   * Buy one of the catalog item identified by `shortId`. Validates config,
   * delegates to `ShopHelper.purchaseCatalogItem`, emits
   * `PURCHASE_COMPLETE` + `STOCK_CHANGED`, sends a system message, and
   * invokes `onPurchaseComplete` if the subclass overrides it.
   *
   * Subclasses can override this to customize buy guards, but most will
   * prefer to override `onPurchaseComplete` instead.
   */
  protected async buyCatalogItem(
    initiator: PluginActionInitiator | undefined,
    shortId: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config || !this.isShopEnabled(config)) {
      return { success: false, message: this.shopClosedMessage() }
    }
    if (!this.isSellingItems(config)) {
      return { success: false, message: this.notSellingMessage() }
    }

    const item = this.shop.getItem(shortId)
    if (!item) {
      return { success: false, message: `Unknown item: ${shortId}` }
    }

    const result = await this.shop.purchaseCatalogItem(initiator, shortId)
    if (!result.success) {
      return { success: false, message: result.message }
    }

    const price = item.definition.coinValue ?? 0
    const username = initiator?.username?.trim() || initiator?.userId || "Someone"

    await this.emit<ShopPurchaseCompletePayload>("PURCHASE_COMPLETE", {
      userId: initiator?.userId ?? "",
      username,
      item: shortId,
      price,
      stock: await this.shop.getStock(this.getDefaultSellQuoteShortId()),
      sellPrice: this.shop.getSellPrice(this.getDefaultSellQuoteShortId()),
    })
    await this.emitStockChanged()

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `${username} bought ${item.definition.name} for ${price} coins.`,
    )

    await this.onPurchaseComplete(initiator, item, result)

    return { success: true, message: result.message }
  }

  /**
   * Reset every item's stock to its starting quantity. Triggered by the
   * `restockActionId` admin action.
   */
  protected async adminRestock(): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config || !this.isShopEnabled(config)) {
      return { success: false, message: this.shopClosedMessage() }
    }
    await this.shop.restockAll()
    await this.emitStockChanged()
    return {
      success: true,
      message: "Shop stock reset to each item's configured starting quantity.",
    }
  }

  // ==========================================================================
  // Inventory hook
  // ==========================================================================

  /**
   * Default `onItemSold` that delegates to `ShopHelper.sell`, emits
   * `SALE_COMPLETE` + `STOCK_CHANGED`, and posts a system message. Subclasses
   * that need bespoke sell logic can override this directly; most will
   * prefer to override `onSaleComplete` for additional side effects.
   */
  async onItemSold(
    userId: string,
    item: InventoryItem,
    definition: ItemDefinition,
    _callContext?: unknown,
  ): Promise<ItemSellResult> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config || !this.isShopEnabled(config)) {
      return { success: false, message: this.shopClosedMessage() }
    }

    const [user] = await this.context.api.getUsersByIds([userId])
    const username = user?.username?.trim() || userId

    const result = await this.shop.sell({ userId, username }, item.itemId)
    if (!result.success) {
      return { success: false, message: result.message }
    }

    const refund = result.refund ?? 0
    await this.emit<ShopSaleCompletePayload>("SALE_COMPLETE", {
      userId,
      username,
      item: definition.shortId,
      refund,
      stock: await this.shop.getStock(this.getDefaultSellQuoteShortId()),
      sellPrice: this.shop.getSellPrice(this.getDefaultSellQuoteShortId()),
    })
    await this.emitStockChanged()

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `${username} sold a ${definition.name} back for ${refund} coins.`,
    )

    await this.onSaleComplete(userId, username, definition, result)

    return { success: true, message: result.message, refund }
  }

  // ==========================================================================
  // Subclass extension hooks
  // ==========================================================================

  /**
   * Called after a successful purchase, after `PURCHASE_COMPLETE` /
   * `STOCK_CHANGED` have been emitted and the system message sent. Override
   * to apply item-specific side effects.
   */
  protected async onPurchaseComplete(
    _initiator: PluginActionInitiator | undefined,
    _item: ShopItem,
    _result: ShopTransactionResult,
  ): Promise<void> {}

  /**
   * Called after a successful sale, after `SALE_COMPLETE` / `STOCK_CHANGED`
   * have been emitted and the system message sent.
   */
  protected async onSaleComplete(
    _userId: string,
    _username: string,
    _definition: ItemDefinition,
    _result: ShopTransactionResult,
  ): Promise<void> {}

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * Emit a `STOCK_CHANGED` event with the current stock snapshot plus a
   * `sellPrice` quote for `defaultSellQuoteShortId`.
   */
  protected async emitStockChanged(): Promise<void> {
    if (!this.context) return
    const snapshot = await this.shop.getComponentStateWithSellPrice(
      this.getDefaultSellQuoteShortId(),
    )
    await this.emit<ShopStockChangedPayload>("STOCK_CHANGED", snapshot)
  }

  private getDefaultSellQuoteShortId(): string {
    if (this.defaultSellQuoteShortId) return this.defaultSellQuoteShortId
    const first = this.shopItems[0]?.definition.shortId
    if (!first) {
      throw new Error(`[${this.name}] ShopPlugin requires at least one shop item.`)
    }
    return first
  }

  /** User-facing message when the plugin is fully disabled. Override to customise. */
  protected shopClosedMessage(): string {
    return "The shop is closed."
  }

  /**
   * User-facing message when `isSellingItems` is false. Override to customise.
   */
  protected notSellingMessage(): string {
    return "The shop is not selling items right now."
  }
}
