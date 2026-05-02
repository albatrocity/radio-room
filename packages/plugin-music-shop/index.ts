import { z } from "zod"
import { BasePlugin, ShopHelper } from "@repo/plugin-base"
import type {
  Plugin,
  PluginActionInitiator,
  PluginContext,
  PluginConfigSchema,
  PluginComponentSchema,
  SystemEventPayload,
  InventoryItem,
  ItemDefinition,
  ItemUseResult,
  ItemSellResult,
} from "@repo/types"
import packageJson from "./package.json"
import {
  musicShopConfigSchema,
  defaultMusicShopConfig,
  buildMusicShopItems,
  requireMusicShopCatalogEntry,
  type MusicShopConfig,
} from "./types"

export type { MusicShopConfig } from "./types"
export {
  musicShopConfigSchema,
  defaultMusicShopConfig,
  buildMusicShopItems,
  MUSIC_SHOP_CATALOG,
  getMusicShopCatalogEntry,
  requireMusicShopCatalogEntry,
} from "./types"

const PLUGIN_NAME = "music-shop"
const SKIP_TOKEN_SHORT_ID = "skip-token"

interface MusicShopComponentState extends Record<string, unknown> {
  skipTokenStock: number
  sellPrice: number
}

interface MusicShopEvents {
  STOCK_CHANGED: {
    skipTokenStock: number
    sellPrice: number
  }
  PURCHASE_COMPLETE: {
    userId: string
    username: string
    item: "skip-token"
    price: number
    skipTokenStock: number
    sellPrice: number
  }
  SALE_COMPLETE: {
    userId: string
    username: string
    item: "skip-token"
    refund: number
    skipTokenStock: number
    sellPrice: number
  }
}

export class MusicShopPlugin extends BasePlugin<MusicShopConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description =
    "In-room shop where users spend coins on items that affect playback (Skip Tokens, etc)."

  // Cast avoids duplicate zod installs resolving to different `z` module instances under npm workspaces.
  static readonly configSchema = musicShopConfigSchema as any
  static readonly defaultConfig = defaultMusicShopConfig

  private shop!: ShopHelper

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.shop = new ShopHelper(this.name, context, buildMusicShopItems())
    this.shop.registerItems()

    this.on("GAME_SESSION_STARTED", this.onGameSessionStarted.bind(this))
  }

  // ==========================================================================
  // Schemas
  // ==========================================================================

  getConfigSchema(): PluginConfigSchema {
    return {
      jsonSchema: (
        z as unknown as { toJSONSchema: (s: unknown) => Record<string, unknown> }
      ).toJSONSchema(musicShopConfigSchema),
      layout: [
        { type: "heading", content: "Music Shop" },
        {
          type: "text-block",
          content:
            "Lets users spend `coin` on items that affect playback. Stock resets at the start of each game session.",
          variant: "info",
        },
        "enabled",
        "isSellingItems",
        {
          type: "action",
          action: "restock",
          label: "Restock shop now",
          variant: "outline",
          confirmMessage:
            "Reset the available stock for every shop item to its configured starting quantity?",
          confirmText: "Restock",
          showWhen: { field: "enabled", value: true },
        },
      ],
      fieldMeta: {
        enabled: {
          type: "boolean",
          label: "Enable Music Shop",
          description:
            "When enabled, users can use shop items they own. Disable to fully turn off the plugin.",
        },
        isSellingItems: {
          type: "boolean",
          label: "Sell items in shop",
          description:
            "When off, the Shop tab is hidden and purchases are blocked, but users can still use and sell items they already own.",
          showWhen: { field: "enabled", value: true },
        },
      },
    }
  }

  getComponentSchema(): PluginComponentSchema {
    const scratchedCd = requireMusicShopCatalogEntry(SKIP_TOKEN_SHORT_ID)
    return {
      components: [
        {
          id: "music-shop-tab",
          type: "tab",
          area: "gameStateTab",
          label: "Music Shop",
          icon: "shopping-cart",
          // Tab is only shown when the plugin is enabled AND actively selling.
          // Items are still usable when isSellingItems is off; only the
          // shop UI is hidden.
          showWhen: [
            { field: "enabled", value: true },
            { field: "isSellingItems", value: true },
          ],
          children: [
            {
              id: "music-shop-skip-token-heading",
              type: "heading",
              area: "gameStateTab",
              content: "Scratched CD",
              level: 3,
            },
            {
              id: "music-shop-skip-token-description",
              type: "text-block",
              area: "gameStateTab",
              content: [
                { type: "text", content: "Skip the currently playing song. " },
                { type: "text", content: `Cost: ${scratchedCd.coinValue} coins. ` },
                { type: "text", content: "{{skipTokenStock}} in stock." },
              ],
            },
            {
              id: "music-shop-buy-skip-token",
              type: "button",
              area: "gameStateTab",
              label: `Buy Scratched CD (${scratchedCd.coinValue} coins)`,
              icon: scratchedCd.icon,
              variant: "solid",
              size: "sm",
              action: "buySkipToken",
            },
          ],
        },
      ],
      storeKeys: ["skipTokenStock", "sellPrice"],
    }
  }

  async getComponentState(): Promise<MusicShopComponentState> {
    const stock = await this.shop.getStock(SKIP_TOKEN_SHORT_ID)
    return {
      skipTokenStock: stock,
      sellPrice: this.computeSellPrice(),
    }
  }

  // ==========================================================================
  // Event handlers
  // ==========================================================================

  private async onGameSessionStarted(
    _data: SystemEventPayload<"GAME_SESSION_STARTED">,
  ): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return
    await this.shop.restockAll()
    await this.emitStockChanged()
  }

  // ==========================================================================
  // Plugin actions (admin + user-triggered)
  // ==========================================================================

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (action === "buySkipToken") {
      return this.buySkipToken(initiator)
    }
    if (action === "restock") {
      return this.adminRestock()
    }
    return { success: false, message: `Unknown action: ${action}` }
  }

  private async buySkipToken(
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "The Music Shop is closed." }
    }
    if (!config.isSellingItems) {
      return { success: false, message: "The Music Shop is not selling items right now." }
    }

    const price = requireMusicShopCatalogEntry(SKIP_TOKEN_SHORT_ID).coinValue
    const result = await this.shop.purchase(initiator, SKIP_TOKEN_SHORT_ID, price)

    if (result.success && result.newStock !== undefined) {
      const username = initiator?.username?.trim() || initiator?.userId || "Someone"
      await this.emit<MusicShopEvents["PURCHASE_COMPLETE"]>("PURCHASE_COMPLETE", {
        userId: initiator?.userId ?? "",
        username,
        item: "skip-token",
        price,
        skipTokenStock: result.newStock,
        sellPrice: this.computeSellPrice(),
      })
      await this.emitStockChanged(result.newStock)

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `${username} bought a Skip Token for ${price} coins.`,
      )
    }

    return { success: result.success, message: result.message }
  }

  private async adminRestock(): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Music Shop is disabled." }
    }
    await this.shop.restockAll()
    await this.emitStockChanged()
    return {
      success: true,
      message: `Skip Token stock restocked to ${requireMusicShopCatalogEntry(SKIP_TOKEN_SHORT_ID).initialStock}.`,
    }
  }

  // ==========================================================================
  // Inventory hooks (use + sell)
  // ==========================================================================

  async onItemUsed(
    userId: string,
    _item: InventoryItem,
    definition: ItemDefinition,
    _callContext?: unknown,
  ): Promise<ItemUseResult> {
    if (!this.context) {
      return { success: false, consumed: false, message: "Plugin not initialized" }
    }
    if (definition.shortId !== SKIP_TOKEN_SHORT_ID) {
      return { success: false, consumed: false, message: `Unknown item: ${definition.shortId}` }
    }

    const np = await this.context.api.getNowPlaying(this.context.roomId)
    if (!np?.mediaSource?.trackId) {
      return { success: false, consumed: false, message: "Nothing is playing right now." }
    }

    try {
      await this.context.api.skipTrack(this.context.roomId, np.mediaSource.trackId)
    } catch (err) {
      console.error(`[${this.name}] skipTrack failed`, err)
      return { success: false, consumed: false, message: "Could not skip the track." }
    }

    const [user] = await this.context.api.getUsersByIds([userId])
    const username = user?.username?.trim() || userId
    await this.context.api.sendSystemMessage(this.context.roomId, `${username} used a Skip Token!`)

    return { success: true, consumed: true, message: "Skipped!" }
  }

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
    if (!config?.enabled) {
      return { success: false, message: "The Music Shop is closed." }
    }

    const [user] = await this.context.api.getUsersByIds([userId])
    const username = user?.username?.trim() || userId

    const result = await this.shop.sell({ userId, username }, item.itemId, {
      basePrice: requireMusicShopCatalogEntry(SKIP_TOKEN_SHORT_ID).coinValue,
    })

    if (result.success) {
      const refund = result.refund ?? 0
      await this.emit<MusicShopEvents["SALE_COMPLETE"]>("SALE_COMPLETE", {
        userId,
        username,
        item: "skip-token",
        refund,
        skipTokenStock: result.newStock ?? 0,
        sellPrice: this.computeSellPrice(),
      })
      await this.emitStockChanged(result.newStock)

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `${username} sold a ${definition.name} back for ${refund} coins.`,
      )
    }

    return { success: result.success, message: result.message, refund: result.refund }
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private computeSellPrice(): number {
    const entry = requireMusicShopCatalogEntry(SKIP_TOKEN_SHORT_ID)
    return Math.max(0, Math.floor(entry.coinValue * entry.sellBackRatio))
  }

  private async emitStockChanged(overrideStock?: number): Promise<void> {
    const stock = overrideStock ?? (await this.shop.getStock(SKIP_TOKEN_SHORT_ID))
    await this.emit<MusicShopEvents["STOCK_CHANGED"]>("STOCK_CHANGED", {
      skipTokenStock: stock,
      sellPrice: this.computeSellPrice(),
    })
  }
}

export function createMusicShopPlugin(configOverrides?: Partial<MusicShopConfig>): Plugin {
  return new MusicShopPlugin(configOverrides)
}

export default createMusicShopPlugin
