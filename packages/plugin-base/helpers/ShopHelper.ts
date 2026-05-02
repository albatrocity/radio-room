import type {
  ItemDefinition,
  PluginActionInitiator,
  PluginComponentDefinition,
  PluginContext,
} from "@repo/types"

/**
 * A catalog entry for an item sold in a shop. Combines the item definition
 * fields with shop-specific properties (price, stock, sell-back ratio).
 *
 * Use this type when defining a static catalog array. Convert to `ShopItem[]`
 * via `buildShopItemsFromCatalog()` before passing to `ShopHelper`.
 */
export type ShopCatalogEntry = Omit<ItemDefinition, "id" | "sourcePlugin"> & {
  /** Required icon for shop/inventory UIs. */
  icon: string
  /** Required price in coins. */
  coinValue: number
  /** Units restocked per game session (see `ShopHelper.restockAll`). */
  initialStock: number
  /** Fraction of price refunded when sold back (0-1). */
  sellBackRatio: number
}

/**
 * Convert a catalog array into `ShopItem[]` for `ShopHelper`.
 */
export function buildShopItemsFromCatalog(catalog: readonly ShopCatalogEntry[]): ShopItem[] {
  return catalog.map(({ initialStock, sellBackRatio, ...definition }) => ({
    definition,
    initialStock,
    sellBackRatio,
  }))
}

/**
 * Definition for an item sold in a shop (runtime format for `ShopHelper`).
 *
 * `definition` is forwarded to `inventory.registerItemDefinitions()`. The
 * `initialStock` is the per-game-session starting quantity (restocked on
 * `restockAll`), and `sellBackRatio` is the fraction of `coinValue` refunded
 * when the user sells the item back.
 */
export interface ShopItem {
  /** Item definition (registered via inventory.registerItemDefinitions). */
  definition: Omit<ItemDefinition, "id" | "sourcePlugin">
  /** Starting stock per game session. Restocked on `restockAll`. */
  initialStock: number
  /** Fraction of price refunded when sold back (0-1). */
  sellBackRatio: number
}

/**
 * Result returned by purchase/sell flows.
 */
export interface ShopTransactionResult {
  success: boolean
  message: string
  /** Updated stock for the item (purchase + sell). */
  newStock?: number
  /** Coins refunded (sell only). */
  refund?: number
}

/**
 * Options for `generateComponents()`.
 */
export interface GenerateShopComponentsOptions {
  /**
   * Prefix used to derive per-item buy actions (e.g. `"buy"` produces
   * `"buySkipToken"`). The plugin's `executeAction` should route these to
   * `shop.purchase()`.
   */
  buyActionPrefix?: string
  /** When true (default), include a stock indicator in the description. */
  showStock?: boolean
  /**
   * Override the price used in button labels. By default the price falls
   * back to the item's `coinValue` from its definition.
   */
  priceTemplates?: Record<string, string>
}

/**
 * Composable shop helper for plugins that sell consumable / tradeable items
 * for in-game `coin`. Plugins instantiate `ShopHelper` after
 * `super.register()`, register their items, and call `purchase` / `sell`
 * from their action handlers.
 *
 * The helper:
 * - Stores per-item stock in plugin storage (`shop:stock:<shortId>`).
 * - Performs purchase / sell flows atomically with refunds on failure.
 * - Generates declarative UI for each shop item (used inside a `tab`).
 *
 * @example
 * ```typescript
 * import { ShopHelper, ShopItem } from "@repo/plugin-base/helpers"
 *
 * class MusicShopPlugin extends BasePlugin<MusicShopConfig> {
 *   private shop!: ShopHelper
 *
 *   private readonly shopItems: ShopItem[] = [
 *     {
 *       definition: { shortId: "skip-token", name: "Skip Token", ... },
 *       initialStock: 3,
 *       sellBackRatio: 0.5,
 *     },
 *   ]
 *
 *   async register(context: PluginContext) {
 *     await super.register(context)
 *     this.shop = new ShopHelper(this.name, context, this.shopItems)
 *     this.shop.registerItems()
 *     this.on("GAME_SESSION_STARTED", () => this.shop.restockAll())
 *   }
 *
 *   async executeAction(action: string, initiator?: PluginActionInitiator) {
 *     if (action === "buySkipToken") {
 *       const config = await this.getConfig()
 *       return this.shop.purchase(initiator, "skip-token", config.skipTokenPrice)
 *     }
 *   }
 * }
 * ```
 */
export class ShopHelper {
  constructor(
    private readonly pluginName: string,
    private readonly context: PluginContext,
    private readonly items: ShopItem[],
  ) {}

  // ==========================================================================
  // Lookup helpers
  // ==========================================================================

  /** Get the registered ShopItem by short id. */
  getItem(shortId: string): ShopItem | undefined {
    return this.items.find((i) => i.definition.shortId === shortId)
  }

  /** Fully-qualified definition id (e.g. `"music-shop:skip-token"`). */
  getDefinitionId(shortId: string): string {
    return `${this.pluginName}:${shortId}`
  }

  /** Compute the sell price for an item using its sell-back ratio. */
  getSellPrice(shortId: string, basePrice?: number): number {
    const item = this.getItem(shortId)
    if (!item) return 0
    const price = basePrice ?? item.definition.coinValue ?? 0
    return Math.max(0, Math.floor(price * item.sellBackRatio))
  }

  /**
   * Match a plugin action against `shopBuyAction(shortId, buyPrefix)` for every
   * registered item. Returns the matching `shortId`, or `undefined` when the
   * action is not a buy action for this shop.
   */
  matchBuyAction(action: string, buyPrefix?: string): string | undefined {
    for (const item of this.items) {
      if (shopBuyAction(item.definition.shortId, buyPrefix) === action) {
        return item.definition.shortId
      }
    }
    return undefined
  }

  // ==========================================================================
  // Item registration
  // ==========================================================================

  /**
   * Register all configured items with the inventory system. Call once after
   * `super.register()` has set up the context.
   */
  registerItems(): void {
    this.context.inventory.registerItemDefinitions(this.items.map((i) => i.definition))
  }

  // ==========================================================================
  // Stock management
  // ==========================================================================

  /** Read the current stock for an item, falling back to its initial stock. */
  async getStock(shortId: string): Promise<number> {
    const raw = await this.context.storage.get(this.stockKey(shortId))
    if (raw === null) {
      const item = this.getItem(shortId)
      const initial = item?.initialStock ?? 0
      await this.context.storage.set(this.stockKey(shortId), String(initial))
      return initial
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  }

  /** Read all current stock levels keyed by item short id. */
  async getAllStock(): Promise<Record<string, number>> {
    const result: Record<string, number> = {}
    for (const item of this.items) {
      result[item.definition.shortId] = await this.getStock(item.definition.shortId)
    }
    return result
  }

  /** Set the stock for an item. */
  async setStock(shortId: string, quantity: number): Promise<void> {
    const safe = Math.max(0, Math.floor(quantity))
    await this.context.storage.set(this.stockKey(shortId), String(safe))
  }

  /** Atomically decrement stock; returns new stock, or `-1` if sold out. */
  async decrementStock(shortId: string): Promise<number> {
    const remaining = await this.context.storage.dec(this.stockKey(shortId))
    if (remaining < 0) {
      // Restore so we never persist a negative count.
      await this.context.storage.inc(this.stockKey(shortId))
      return -1
    }
    return remaining
  }

  /** Atomically increment stock (e.g. a sell-back). Returns new stock. */
  async incrementStock(shortId: string): Promise<number> {
    return this.context.storage.inc(this.stockKey(shortId))
  }

  /** Reset every item's stock to its `initialStock`. */
  async restockAll(): Promise<void> {
    for (const item of this.items) {
      await this.setStock(item.definition.shortId, item.initialStock)
    }
  }

  // ==========================================================================
  // Purchase / sell flows
  // ==========================================================================

  /**
   * Purchase one of `shortId` for `price` coins. Atomically:
   * - decrements stock (refunds on coin / inventory failure)
   * - debits the user's `coin` attribute
   * - awards the item via `inventory.giveItem`
   *
   * Returns a `success: false` result with a user-facing message when any
   * step fails (sold out, insufficient coins, no active session, etc.).
   */
  /**
   * Purchase using the price configured on the item's catalog entry
   * (`ShopItem.definition.coinValue`). Convenience wrapper around `purchase()`
   * for the common case where shops always charge the catalog price.
   */
  async purchaseCatalogItem(
    initiator: PluginActionInitiator | undefined,
    shortId: string,
  ): Promise<ShopTransactionResult> {
    const item = this.getItem(shortId)
    if (!item) {
      return { success: false, message: `Unknown item: ${shortId}` }
    }
    const price = item.definition.coinValue ?? 0
    return this.purchase(initiator, shortId, price)
  }

  async purchase(
    initiator: PluginActionInitiator | undefined,
    shortId: string,
    price: number,
  ): Promise<ShopTransactionResult> {
    const userId = initiator?.userId
    if (!userId) {
      return { success: false, message: "You must be signed in to buy items." }
    }

    const item = this.getItem(shortId)
    if (!item) {
      return { success: false, message: `Unknown item: ${shortId}` }
    }

    const session = await this.context.game.getActiveSession()
    if (!session) {
      return { success: false, message: "No active game session." }
    }

    // Stock check (atomic decrement, refund on failure).
    const remaining = await this.decrementStock(shortId)
    if (remaining < 0) {
      return { success: false, message: `Sold out — no ${item.definition.name} remaining.` }
    }

    // Coin balance check.
    const userState = await this.context.game.getUserState(userId)
    const currentCoins = userState?.attributes?.coin ?? 0
    if (currentCoins < price) {
      // Refund stock since the buy will not succeed.
      await this.incrementStock(shortId)
      return {
        success: false,
        message: `You need ${price} coins (you have ${currentCoins}).`,
      }
    }

    // Deduct coins.
    await this.context.game.addScore(userId, "coin", -price, `${this.pluginName}:purchase`)

    // Award the item.
    const awarded = await this.context.inventory.giveItem(
      userId,
      this.getDefinitionId(shortId),
      1,
      undefined,
      "purchase",
    )

    if (!awarded) {
      // Refund: restore stock and coins.
      await this.incrementStock(shortId)
      await this.context.game.addScore(userId, "coin", price, `${this.pluginName}:refund`)
      return {
        success: false,
        message: `Inventory full — could not award ${item.definition.name}.`,
      }
    }

    return {
      success: true,
      message: `Bought a ${item.definition.name} for ${price} coins.`,
      newStock: remaining,
    }
  }

  /**
   * Sell one item back to the shop. Looks up the item by `itemId` (instance
   * id) on the user's inventory, removes it, refunds coins based on the
   * item's `sellBackRatio`, and restocks one.
   */
  async sell(
    initiator: PluginActionInitiator | undefined,
    itemId: string,
    options?: { basePrice?: number },
  ): Promise<ShopTransactionResult> {
    const userId = initiator?.userId
    if (!userId) {
      return { success: false, message: "You must be signed in to sell items." }
    }

    const session = await this.context.game.getActiveSession()
    if (!session) {
      return { success: false, message: "No active game session." }
    }

    const inv = await this.context.inventory.getInventory(userId)
    const stack = inv.items.find((i) => i.itemId === itemId)
    if (!stack || stack.quantity <= 0) {
      return { success: false, message: "You don't have that item to sell." }
    }

    const definition = await this.context.inventory.getItemDefinition(stack.definitionId)
    if (!definition || definition.sourcePlugin !== this.pluginName) {
      return { success: false, message: "This shop doesn't buy that item." }
    }

    const item = this.getItem(definition.shortId)
    if (!item) {
      return { success: false, message: "This shop doesn't buy that item." }
    }

    const refund = this.getSellPrice(definition.shortId, options?.basePrice)

    const removed = await this.context.inventory.removeItem(userId, itemId, 1)
    if (!removed) {
      return { success: false, message: `Could not remove ${definition.name} from inventory.` }
    }

    if (refund > 0) {
      await this.context.game.addScore(userId, "coin", refund, `${this.pluginName}:sale`)
    }

    const newStock = await this.incrementStock(definition.shortId)

    return {
      success: true,
      message: `Sold a ${definition.name} for ${refund} coins.`,
      refund,
      newStock,
    }
  }

  // ==========================================================================
  // Declarative UI generation
  // ==========================================================================

  /**
   * Generate declarative UI components for every registered item. Suitable
   * for placing inside a `tab` component's `children`.
   *
   * For each item, this produces a heading, a stock/description text block,
   * and a buy button. Buy actions are derived as
   * `<buyActionPrefix><PascalCaseShortId>` (defaulting to `buy<...>`).
   *
   * Plugins that need bespoke layout can ignore this helper and build their
   * own component tree.
   */
  generateComponents(options?: GenerateShopComponentsOptions): PluginComponentDefinition[] {
    const prefix = options?.buyActionPrefix ?? "buy"
    const showStock = options?.showStock ?? true
    const components: PluginComponentDefinition[] = []

    for (const item of this.items) {
      const { shortId, name, description, icon, coinValue } = item.definition
      const action = `${prefix}${pascalCase(shortId)}`
      const stockKey = shopStockStoreKey(shortId)
      const priceTemplate =
        options?.priceTemplates?.[shortId] ?? (coinValue !== undefined ? String(coinValue) : "—")

      components.push({
        id: `${this.pluginName}-${shortId}-heading`,
        type: "heading",
        area: "gameStateTab",
        content: name,
        level: 4,
      })

      const descParts: string[] = []
      if (description) descParts.push(description)
      if (showStock) descParts.push(`{{${stockKey}}} in stock.`)
      if (descParts.length) {
        components.push({
          id: `${this.pluginName}-${shortId}-description`,
          type: "text-block",
          area: "gameStateTab",
          content: descParts.join(" "),
        })
      }

      components.push({
        id: `${this.pluginName}-${shortId}-buy`,
        type: "button",
        area: "gameStateTab",
        label: `Buy ${name} (${priceTemplate} coins)`,
        icon,
        variant: "solid",
        size: "sm",
        action,
      })
    }

    return components
  }

  /**
   * Default storeKeys to expose to the frontend so that templates like
   * `{{skipTokenStock}}` interpolate correctly. Append to your plugin's
   * `getComponentSchema().storeKeys`.
   */
  getStoreKeys(): string[] {
    return this.items.map((i) => shopStockStoreKey(i.definition.shortId))
  }

  /**
   * Build a snapshot of stock-related store keys for `getComponentState`.
   * Each item gets a `<shortIdCamelCase>Stock` key.
   */
  async getComponentState(): Promise<Record<string, number>> {
    const state: Record<string, number> = {}
    for (const item of this.items) {
      state[shopStockStoreKey(item.definition.shortId)] = await this.getStock(item.definition.shortId)
    }
    return state
  }

  /**
   * Same as `getComponentState()` but adds a `sellPrice` quote computed from
   * `quoteShortId` via `getSellPrice()`. Useful for emitting `STOCK_CHANGED`
   * snapshots that bundle stock + a representative sell-back price.
   */
  async getComponentStateWithSellPrice(
    quoteShortId: string,
  ): Promise<Record<string, number> & { sellPrice: number }> {
    const stocks = await this.getComponentState()
    return { ...stocks, sellPrice: this.getSellPrice(quoteShortId) }
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private stockKey(shortId: string): string {
    return `shop:stock:${shortId}`
  }
}

/** Convert `skip-token` to `SkipToken`. */
function pascalCase(s: string): string {
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")
}

/**
 * Store key for shop stock in plugin component state (e.g. `skip-token` → `skipTokenStock`).
 * Matches `ShopHelper.getStoreKeys()` / `getComponentState()`.
 */
export function shopStockStoreKey(shortId: string): string {
  const camel = shortId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join("")
  return `${camel}Stock`
}

/**
 * Default buy action id for a catalog short id (e.g. `skip-token` → `buySkipToken`).
 * Same convention as `generateComponents()` (`buy` + PascalCase short id).
 */
export function shopBuyAction(shortId: string, buyPrefix = "buy"): string {
  return `${buyPrefix}${pascalCase(shortId)}`
}
