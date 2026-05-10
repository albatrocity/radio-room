import type {
  InventoryItem,
  ItemDefinition,
  ItemRarity,
  PluginActionInitiator,
  PluginContext,
  ShoppingSessionInstance,
  ShopOffer,
  User,
} from "@repo/types"
import { ITEM_SHOPS_SESSION_STORAGE_KEYS } from "@repo/types"
import type { ShopTransactionResult } from "./ShopHelper"
import {
  DEFAULT_RARITY_WEIGHTS,
  type ItemCatalogEntry,
  type ShopCatalogEntry,
  buildItemCatalogMap,
  buildShoppingInstance,
  pickWeightedShortIds,
  resolveItemRarity,
  resolveShopItemPrice,
  resolveUnlistedSellBasePrice,
  isShopListedItem,
  type WeightedCandidate,
} from "./shoppingSessionCatalog"

const KEYS = ITEM_SHOPS_SESSION_STORAGE_KEYS

/**
 * Per-user ephemeral shopping rounds + weighted offers.
 * See ADR 0049.
 */
export class ShoppingSessionHelper {
  private catalogMap: Map<string, ItemCatalogEntry>

  constructor(
    private readonly pluginName: string,
    private readonly context: PluginContext,
    private readonly itemCatalog: readonly ItemCatalogEntry[],
    private readonly shopCatalog: readonly ShopCatalogEntry[],
    private readonly rarityWeights: Record<ItemRarity, number> = DEFAULT_RARITY_WEIGHTS,
  ) {
    this.catalogMap = buildItemCatalogMap(itemCatalog)
  }

  async isActive(): Promise<boolean> {
    const v = await this.context.storage.get(KEYS.ACTIVE)
    return v === "true"
  }

  async setActive(active: boolean): Promise<void> {
    if (active) {
      await this.context.storage.set(KEYS.ACTIVE, "true")
    } else {
      await this.context.storage.del(KEYS.ACTIVE)
    }
  }

  async getInstance(userId: string): Promise<ShoppingSessionInstance | null> {
    const raw = await this.context.storage.hget(KEYS.INSTANCES, userId)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ShoppingSessionInstance
    } catch {
      return null
    }
  }

  async persistInstance(userId: string, instance: ShoppingSessionInstance): Promise<void> {
    await this.context.storage.hset(KEYS.INSTANCES, userId, JSON.stringify(instance))
  }

  /**
   * Clears the instances hash and active flag (does not touch inventory).
   */
  async clearSessionRound(): Promise<void> {
    await this.context.storage.del(KEYS.INSTANCES)
    await this.context.storage.del(KEYS.ACTIVE)
  }

  /**
   * Starts a new shopping round for every user in `users`.
   *
   * @param eligibleShops - Subset of the constructor `shopCatalog` to pick from at random.
   *   When omitted, uses the full catalog. When provided as a non-empty array, only those shops
   *   are eligible. An explicit empty array falls back to the full catalog (backward compatibility).
   */
  async startSession(
    users: readonly Pick<User, "userId">[],
    eligibleShops?: readonly ShopCatalogEntry[],
  ): Promise<void> {
    await this.context.storage.del(KEYS.INSTANCES)
    await this.setActive(true)
    const now = Date.now()
    for (const u of users) {
      await this.assignInstanceForUserId(u.userId, now, eligibleShops)
    }
  }

  /**
   * Picks a random shop, 3 weighted offers (duplicates allowed), persists, DMs the user.
   *
   * @param eligibleShops - Same semantics as {@link startSession}.
   */
  async assignInstanceForUserId(
    userId: string,
    openedAt = Date.now(),
    eligibleShops?: readonly ShopCatalogEntry[],
  ): Promise<void> {
    const pool = this.resolveAssignmentPool(eligibleShops)
    if (pool.length === 0) {
      throw new Error(`[${this.pluginName}] No shops defined.`)
    }
    const shop = pool[Math.floor(Math.random() * pool.length)]!
    const shortIds = this.sampleOfferShortIds(shop, 3)
    const instance = buildShoppingInstance(shop, shortIds, this.catalogMap, openedAt)
    const displayMessage = (shop.openingMessage ?? "{{shopName}} is now open for business!").replace(
      /\{\{shopName\}\}/g,
      shop.name,
    )
    instance.openingMessage = displayMessage
    await this.persistInstance(userId, instance)
    await this.context.api.sendUserSystemMessage(
      this.context.roomId,
      userId,
      displayMessage,
    )
  }

  /**
   * When `eligibleShops` is omitted, use the full catalog. When provided empty, fall back to the
   * full catalog so older callers keep working; callers that need strict empty handling should
   * guard before calling.
   */
  private resolveAssignmentPool(eligibleShops?: readonly ShopCatalogEntry[]): readonly ShopCatalogEntry[] {
    if (eligibleShops === undefined) {
      return this.shopCatalog
    }
    if (eligibleShops.length > 0) {
      return eligibleShops
    }
    return this.shopCatalog
  }

  private sampleOfferShortIds(shop: ShopCatalogEntry, count: number): string[] {
    const candidates: WeightedCandidate[] = shop.availableItems.map((ai) => {
      const entry = this.catalogMap.get(ai.shortId)
      if (!entry) {
        throw new Error(`[${this.pluginName}] Shop ${shop.shopId} lists unknown item ${ai.shortId}`)
      }
      const r = resolveItemRarity(entry.definition)
      const w = this.rarityWeights[r] ?? this.rarityWeights.common
      return { shortId: ai.shortId, weight: w }
    })
    if (candidates.length === 0) {
      return []
    }
    return pickWeightedShortIds(candidates, count)
  }

  private getShopById(shopId: string): ShopCatalogEntry | undefined {
    return this.shopCatalog.find((s) => s.shopId === shopId)
  }

  /**
   * Buy one unit of `shortId` for the initiator. Stock is per-offer `available` flag.
   */
  async purchase(
    initiator: PluginActionInitiator | undefined,
    offerId: number,
  ): Promise<ShopTransactionResult> {
    const userId = initiator?.userId
    if (!userId) {
      return { success: false, message: "You must be signed in to buy items." }
    }
    if (!(await this.isActive())) {
      return { success: false, message: "No shopping session is open right now." }
    }
    const session = await this.context.game.getActiveSession()
    if (!session) {
      return { success: false, message: "No active game session." }
    }
    const inst = await this.getInstance(userId)
    if (!inst) {
      return { success: false, message: "You don't have a shop assigned right now." }
    }
    const offer =
      inst.offers.find((o: ShopOffer) => o.offerId === offerId) ??
      (Number.isInteger(offerId) && offerId >= 0 && offerId < inst.offers.length
        ? inst.offers[offerId]
        : undefined)
    if (!offer) {
      return { success: false, message: "This item is not in your current shop." }
    }
    if (!offer.available) {
      return { success: false, message: `Sold out — no ${offer.name} remaining here.` }
    }
    const price = offer.price
    const shortId = offer.shortId
    const userState = await this.context.game.getUserState(userId)
    const currentCoins = userState?.attributes?.coin ?? 0
    if (currentCoins < price) {
      return {
        success: false,
        message: `You need ${price} coins (you have ${currentCoins}).`,
      }
    }
    await this.context.game.addScore(userId, "coin", -price, `${this.pluginName}:purchase`)
    const awarded = await this.context.inventory.giveItem(
      userId,
      this.getDefinitionId(shortId),
      1,
      undefined,
      "purchase",
    )
    if (!awarded) {
      await this.context.game.addScore(userId, "coin", price, `${this.pluginName}:refund`)
      return { success: false, message: `Inventory full — could not add ${offer.name}.` }
    }
    offer.available = false
    await this.persistInstance(userId, inst)
    return {
      success: true,
      message: `Bought ${offer.name} for ${price} coins.`,
    }
  }

  /**
   * Sell back from inventory when a shop instance is open for this user.
   */
  async sell(userId: string, item: InventoryItem, definition: ItemDefinition): Promise<ShopTransactionResult> {
    if (!(await this.isActive())) {
      return { success: false, message: "No shopping session is open right now." }
    }
    const inst = await this.getInstance(userId)
    if (!inst) {
      return { success: false, message: "You can only sell while your shop visit is open." }
    }
    const shop = this.getShopById(inst.shopId)
    if (!shop) {
      return { success: false, message: "Shop data is out of sync." }
    }
    const session = await this.context.game.getActiveSession()
    if (!session) {
      return { success: false, message: "No active game session." }
    }
    const listed = isShopListedItem(shop, definition.shortId)
    const rate = listed ? shop.listedBuybackRate : shop.unlistedBuybackRate
    const base = listed
      ? resolveShopItemPrice(shop, definition.shortId, this.catalogMap)
      : resolveUnlistedSellBasePrice(this.catalogMap, definition.shortId)
    const refund = Math.max(0, Math.floor(base * rate))
    const removed = await this.context.inventory.removeItem(userId, item.itemId, 1)
    if (!removed) {
      return { success: false, message: `Could not remove ${definition.name} from inventory.` }
    }
    if (refund > 0) {
      await this.context.game.addScore(userId, "coin", refund, `${this.pluginName}:sale`)
    }
    return {
      success: true,
      message: `Sold ${definition.name} for ${refund} coins.`,
      refund,
    }
  }

  getDefinitionId(shortId: string): string {
    return `${this.pluginName}:${shortId}`
  }
}
