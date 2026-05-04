import { z } from "zod"
import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { BasePlugin, applyTextEffects, countTextEffectStacks, ShoppingSessionHelper } from "@repo/plugin-base"
import {
  type ChatMessage,
  type ItemDefinition,
  type ItemSellResult,
  type ItemUseResult,
  type Plugin,
  type PluginActionInitiator,
  type PluginComponentSchema,
  type PluginConfigSchema,
  type InventoryItem,
  type SystemEventPayload,
} from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import packageJson from "./package.json"
import { ITEM_USE_BEHAVIORS } from "./behaviors"
import { ITEM_CATALOG } from "./items"
import { SHOP_CATALOG } from "./shops"
import {
  itemShopsConfigSchema,
  defaultItemShopsConfig,
  type ItemShopsConfig,
} from "./types"

const PLUGIN_NAME = ITEM_SHOPS_PLUGIN_NAME

function getEligibleShops(config: ItemShopsConfig): ItemShopsShopCatalogEntry[] {
  const knownIds = new Set(SHOP_CATALOG.map((s) => s.shopId))
  const selected = new Set(config.enabledShopIds.filter((id) => knownIds.has(id)))
  return SHOP_CATALOG.filter((s) => selected.has(s.shopId))
}

export type { ItemShopsConfig } from "./types"
export { itemShopsConfigSchema, defaultItemShopsConfig } from "./types"
export { ITEM_CATALOG } from "./items"
export { SHOP_CATALOG } from "./shops"

export class ItemShopsPlugin extends BasePlugin<ItemShopsConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "Item shops with random per-user offers and shopping sessions."

  static readonly configSchema = itemShopsConfigSchema as any
  static readonly defaultConfig = defaultItemShopsConfig

  private shopping!: ShoppingSessionHelper

  async register(context: import("@repo/types").PluginContext): Promise<void> {
    await super.register(context)
    this.shopping = new ShoppingSessionHelper(
      this.name,
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )
    this.context!.inventory.registerItemDefinitions(ITEM_CATALOG.map((e) => e.definition))
    this.on("GAME_SESSION_ENDED", this.handleGameSessionEnded.bind(this))
    this.on("USER_JOINED", this.handleUserJoined.bind(this))
  }

  private async handleGameSessionEnded(_data: SystemEventPayload<"GAME_SESSION_ENDED">): Promise<void> {
    await this.shopping.clearSessionRound()
    await this.stripOwnedItemsFromAllUsers()
  }

  private async handleUserJoined(data: SystemEventPayload<"USER_JOINED">): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled || !config.assignShopOnJoin) return
    if (!(await this.shopping.isActive())) return
    const eligible = getEligibleShops(config)
    if (eligible.length === 0) return
    await this.shopping.assignInstanceForUserId(data.user.userId, Date.now(), eligible)
    await this.emit("SHOPPING_SESSION_UPDATED", { roomId: this.context.roomId })
  }

  /** Remove every inventory stack owned by this plugin for all users currently in the room. */
  private async stripOwnedItemsFromAllUsers(): Promise<void> {
    if (!this.context) return
    const users = await this.context.api.getUsers(this.context.roomId)
    for (const u of users) {
      const inv = await this.context.inventory.getInventory(u.userId)
      for (const stack of inv.items) {
        if (stack.sourcePlugin === this.name) {
          await this.context.inventory.removeItem(u.userId, stack.itemId, stack.quantity)
        }
      }
    }
  }

  getConfigSchema(): PluginConfigSchema {
    return {
      jsonSchema: (
        z as unknown as { toJSONSchema: (s: unknown) => Record<string, unknown> }
      ).toJSONSchema(itemShopsConfigSchema),
      layout: [
        { type: "heading", content: "Item Shops" },
        {
          type: "text-block",
          content:
            "Defines master items and shops in code. Start a shopping session to give each listener a random shop with 3 weighted offers. Items expire when the game session ends.",
          variant: "info",
        },
        "enabled",
        "enabledShopIds",
        "assignShopOnJoin",
        "effectDurationMs",
        {
          type: "action",
          action: "startShoppingSession",
          label: "Start new shopping session",
          variant: "solid",
          confirmMessage: "Start a new shopping session for everyone in the room?",
          confirmText: "Start",
          showWhen: { field: "enabled", value: true },
        },
        {
          type: "action",
          action: "endShoppingSessions",
          label: "End all shopping sessions",
          variant: "outline",
          confirmMessage: "End every active shop instance and clear the current round?",
          confirmText: "End all",
          showWhen: { field: "enabled", value: true },
        },
      ],
      fieldMeta: {
        enabled: {
          type: "boolean",
          label: "Enable Item Shops",
          description:
            "When enabled, items can be used and shopping sessions can run. Turn off to disable shop behaviour.",
        },
        enabledShopIds: {
          type: "checkbox-group",
          label: "Shops in rotation",
          description:
            "Only checked shops are eligible when randomly assigning a shop for a shopping session.",
          options: SHOP_CATALOG.map((s) => ({ value: s.shopId, label: s.name })),
          showWhen: { field: "enabled", value: true },
        },
        assignShopOnJoin: {
          type: "boolean",
          label: "Assign shop when users join mid-session",
          description:
            "If a shopping round is active, give late joiners their own random shop instance.",
          showWhen: { field: "enabled", value: true },
        },
        effectDurationMs: {
          type: "duration",
          label: "Pedal effect duration",
          description: "How long timed chat modifiers last when a pedal is used.",
          displayUnit: "minutes",
          storageUnit: "milliseconds",
          showWhen: { field: "enabled", value: true },
        },
      },
    }
  }

  getComponentSchema(): PluginComponentSchema {
    return {
      components: [
        {
          id: "item-shops-tab",
          type: "tab",
          area: "gameStateTab",
          label: "Item Shop",
          icon: "shopping-cart",
          showWhen: { field: "enabled", value: true },
          children: [
            {
              id: "item-shops-offers",
              type: "current-shop-offers",
              area: "gameStateTab",
            },
          ],
        },
      ],
    }
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (action === "startShoppingSession") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const eligible = getEligibleShops(config)
      if (eligible.length === 0) {
        return {
          success: false,
          message: "Select at least one shop in Item Shops settings (Shops in rotation).",
        }
      }
      const users = await this.context.api.getUsers(this.context.roomId)
      await this.shopping.startSession(users, eligible)
      await this.emit("SHOPPING_SESSION_STARTED", { roomId: this.context.roomId })
      return { success: true, message: "Shopping session started." }
    }
    if (action === "endShoppingSessions") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      await this.shopping.clearSessionRound()
      await this.emit("SHOPPING_SESSION_ENDED", { roomId: this.context.roomId })
      return { success: true, message: "All shopping sessions ended." }
    }
    if (action.startsWith("buy:")) {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const shortId = action.slice("buy:".length)
      const result = await this.shopping.purchase(initiator, shortId)
      if (result.success) {
        await this.emit("SHOPPING_SESSION_UPDATED", { roomId: this.context.roomId })
      }
      return { success: result.success, message: result.message }
    }
    return super.executeAction(action, initiator)
  }

  async onItemUsed(
    userId: string,
    _item: InventoryItem,
    definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> {
    if (!this.context) {
      return { success: false, consumed: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, consumed: false, message: "Item Shops are disabled." }
    }

    const handler = ITEM_USE_BEHAVIORS[definition.shortId]
    if (!handler) {
      return { success: false, consumed: false, message: `Unknown item: ${definition.shortId}` }
    }

    return handler(
      {
        pluginName: this.name,
        context: this.context,
        game: this.game,
        effectDurationMs: config.effectDurationMs,
      },
      userId,
      definition,
      callContext,
    )
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
      return { success: false, message: "Item Shops are disabled." }
    }

    const [user] = await this.context.api.getUsersByIds([userId])
    const username = user?.username?.trim() || userId

    const result = await this.shopping.sell(userId, item, definition)
    if (!result.success) {
      return { success: false, message: result.message }
    }

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `${username} sold a ${definition.name} back for ${result.refund ?? 0} coins.`,
    )

    return { success: true, message: result.message, refund: result.refund }
  }

  async transformChatMessage(roomId: string, message: ChatMessage): Promise<ChatMessage | null> {
    if (!this.context || roomId !== this.context.roomId) return null
    const config = await this.getConfig()
    if (!config?.enabled) return null

    const state = await this.game.getUserState(message.user.userId)
    if (!state) return null

    const stacks = countTextEffectStacks(state.modifiers, Date.now())
    const transformed = applyTextEffects(message.content, stacks)
    if (!transformed) return null

    return { ...message, content: transformed.content, contentSegments: transformed.contentSegments }
  }
}

export function createItemShopsPlugin(configOverrides?: Partial<ItemShopsConfig>): Plugin {
  return new ItemShopsPlugin(configOverrides)
}

export default createItemShopsPlugin
