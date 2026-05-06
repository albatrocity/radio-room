import { z } from "zod"
import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import {
  BasePlugin,
  applyTextEffects,
  countTextEffectStacks,
  ShoppingSessionHelper,
} from "@repo/plugin-base"
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
import { ITEM_CATALOG, ITEM_USE_BEHAVIORS } from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { itemShopsConfigSchema, defaultItemShopsConfig, type ItemShopsConfig } from "./types"

const PLUGIN_NAME = ITEM_SHOPS_PLUGIN_NAME

const GREEN_ROOM_SHOP_ID = "green-room"
const GREEN_ROOM_RETURN_MS = 5 * 60 * 1000
const GREEN_ROOM_RETURN_PREFIX = "greenRoomReturn:"

function getEligibleShops(config: ItemShopsConfig): ItemShopsShopCatalogEntry[] {
  const knownIds = new Set(SHOP_CATALOG.map((s) => s.shopId))
  const selected = new Set(config.enabledShopIds.filter((id) => knownIds.has(id)))
  return SHOP_CATALOG.filter((s) => selected.has(s.shopId))
}

export type { ItemShopsConfig } from "./types"
export { itemShopsConfigSchema, defaultItemShopsConfig } from "./types"
export { ITEM_CATALOG, items } from "./items/index"
export { SHOP_CATALOG } from "./shops"

export class ItemShopsPlugin extends BasePlugin<ItemShopsConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "Item shops with random per-user offers and shopping sessions."

  static readonly configSchema = itemShopsConfigSchema as any
  static readonly defaultConfig = defaultItemShopsConfig

  private shopping!: ShoppingSessionHelper

  /** Per-shop state stores for `onBuy` callbacks (keyed by shopId, then by arbitrary key). */
  private shopStateStores = new Map<string, Map<string, unknown>>()

  async register(context: import("@repo/types").PluginContext): Promise<void> {
    await super.register(context)
    this.shopping = new ShoppingSessionHelper(this.name, context, ITEM_CATALOG, SHOP_CATALOG)
    this.context!.inventory.registerItemDefinitions(ITEM_CATALOG.map((e) => e.definition))
    this.on("GAME_SESSION_ENDED", this.handleGameSessionEnded.bind(this))
    this.on("USER_JOINED", this.handleUserJoined.bind(this))
  }

  private async handleGameSessionEnded(
    _data: SystemEventPayload<"GAME_SESSION_ENDED">,
  ): Promise<void> {
    this.disposeGreenRoomReturnTimers()
    this.clearShopTimersAndState()
    await this.shopping.clearSessionRound()
    await this.stripOwnedItemsFromAllUsers()
  }

  private disposeGreenRoomReturnTimers(): void {
    for (const timer of this.getAllTimers()) {
      if (timer.id.startsWith(GREEN_ROOM_RETURN_PREFIX)) {
        this.clearTimer(timer.id)
      }
    }
  }

  private async processGreenRoomDepartures(): Promise<void> {
    if (!this.context) return
    const greenRoomStore = this.shopStateStores.get(GREEN_ROOM_SHOP_ID)
    if (!greenRoomStore || greenRoomStore.size === 0) return

    const userIds = Array.from(greenRoomStore.keys())
    for (const userId of userIds) {
      const inv = await this.context.inventory.getInventory(userId)
      const stacks = inv.items.filter((s) => s.sourcePlugin === this.name && s.quantity > 0)
      if (stacks.length === 0) {
        greenRoomStore.delete(userId)
        continue
      }

      const stack = stacks[Math.floor(Math.random() * stacks.length)]!
      const definition = await this.context.inventory.getItemDefinition(stack.definitionId)
      const itemName = definition?.name ?? "item"

      const removed = await this.context.inventory.removeItem(userId, stack.itemId, 1)
      if (!removed) {
        greenRoomStore.delete(userId)
        continue
      }

      const [user] = await this.context.api.getUsersByIds([userId])
      const username = user?.username?.trim() || userId

      const message = `Hey, you left your ${itemName}. We're closing up for the night but we'll get it back to you soon.`
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        message,
        { type: "alert", status: "info", title: "Message from the Green Room" },
        [username],
      )

      const definitionId = stack.definitionId
      const roomId = this.context.roomId
      this.startTimer(`${GREEN_ROOM_RETURN_PREFIX}${userId}:${Date.now()}`, {
        duration: GREEN_ROOM_RETURN_MS,
        callback: async () => {
          if (!this.context) return
          const returned = await this.context.inventory.giveItem(
            userId,
            definitionId,
            1,
            undefined,
            "purchase",
          )
          if (!returned) return
          const [u] = await this.context.api.getUsersByIds([userId])
          const mentionName = u?.username?.trim() || userId
          const followUp = `hey here's your ${itemName} back`
          await this.context.api.sendSystemMessage(
            roomId,
            followUp,
            { type: "alert", status: "info", title: "Message from the Green Room" },
            [mentionName],
          )
        },
      })

      greenRoomStore.delete(userId)
    }

    if (greenRoomStore.size === 0) {
      this.shopStateStores.delete(GREEN_ROOM_SHOP_ID)
    }
  }

  private shopTimerPrefix(shopId: string): string {
    return `shop:${shopId}:`
  }

  private clearShopTimersAndState(): void {
    for (const shop of SHOP_CATALOG) {
      const prefix = this.shopTimerPrefix(shop.shopId)
      for (const timer of this.getAllTimers()) {
        if (timer.id.startsWith(prefix)) {
          this.clearTimer(timer.id)
        }
      }
      shop.onSessionEnd?.()
    }
    this.shopStateStores.clear()
  }

  private async resolveBuyerUsername(initiator: PluginActionInitiator): Promise<string> {
    const fromInitiator = initiator.username?.trim()
    if (fromInitiator) return fromInitiator
    if (!this.context) return initiator.userId
    const [user] = await this.context.api.getUsersByIds([initiator.userId])
    return user?.username?.trim() || initiator.userId
  }

  private getShopStateStore(shopId: string): Map<string, unknown> {
    let store = this.shopStateStores.get(shopId)
    if (!store) {
      store = new Map()
      this.shopStateStores.set(shopId, store)
    }
    return store
  }

  private createShopBuyContext(
    shop: ItemShopsShopCatalogEntry,
    userId: string,
    username: string,
    itemShortId: string,
    itemName: string,
  ): ShopBuyContext {
    const timerPrefix = this.shopTimerPrefix(shop.shopId)
    const stateStore = this.getShopStateStore(shop.shopId)

    const ctx: ShopBuyContext = {
      roomId: this.context!.roomId,
      userId,
      username,
      itemShortId,
      itemName,

      startTimer: (id, config) => {
        this.startTimer(timerPrefix + id, config)
      },
      getTimer: <T = unknown>(id: string) => {
        const timer = this.getTimer<T>(timerPrefix + id)
        return timer ? { id: timer.id, data: timer.data as T | undefined } : null
      },
      clearTimer: (id) => this.clearTimer(timerPrefix + id),

      sendSystemMessage: async (message, meta, mentions) => {
        await this.context!.api.sendSystemMessage(this.context!.roomId, message, meta, mentions)
      },

      isShoppingActive: () => this.shopping.isActive(),
      isGameSessionActive: async () => {
        const session = await this.context!.game.getActiveSession()
        return session != null
      },
      isUserInRoom: async (uid) => {
        const users = await this.context!.api.getUsers(this.context!.roomId)
        return users.some((u) => u.userId === uid)
      },

      getState: <T>(key: string) => stateStore.get(key) as T | undefined,
      setState: <T>(key: string, value: T) => {
        stateStore.set(key, value)
      },
      deleteState: (key) => {
        stateStore.delete(key)
      },
    }
    return ctx
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
      await this.processGreenRoomDepartures()
      const users = await this.context.api.getUsers(this.context.roomId)
      await this.shopping.startSession(users, eligible)
      await this.emit("SHOPPING_SESSION_STARTED", { roomId: this.context.roomId })
      return { success: true, message: "Shopping session started." }
    }
    if (action === "endShoppingSessions") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      await this.processGreenRoomDepartures()
      await this.shopping.clearSessionRound()
      await this.emit("SHOPPING_SESSION_ENDED", { roomId: this.context.roomId })
      return { success: true, message: "All shopping sessions ended." }
    }
    if (action.startsWith("buy:")) {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const offerId = Number.parseInt(action.slice("buy:".length), 10)
      if (!Number.isInteger(offerId)) {
        return { success: false, message: "Invalid offer." }
      }
      const result = await this.shopping.purchase(initiator, offerId)
      if (result.success && initiator?.userId) {
        const instance = await this.shopping.getInstance(initiator.userId)
        if (instance) {
          const shop = SHOP_CATALOG.find((s) => s.shopId === instance.shopId)
          if (shop?.onBuy) {
            const offer =
              instance.offers.find((o) => o.offerId === offerId) ?? instance.offers[offerId]
            const shortId = offer?.shortId ?? String(offerId)
            const purchasedItemName = offer?.name ?? shortId
            const username = await this.resolveBuyerUsername(initiator)
            const ctx = this.createShopBuyContext(
              shop,
              initiator.userId,
              username,
              shortId,
              purchasedItemName,
            )
            await shop.onBuy(ctx)
          }
        }
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

    return {
      ...message,
      content: transformed.content,
      contentSegments: transformed.contentSegments,
    }
  }
}

export function createItemShopsPlugin(configOverrides?: Partial<ItemShopsConfig>): Plugin {
  return new ItemShopsPlugin(configOverrides)
}

export default createItemShopsPlugin
