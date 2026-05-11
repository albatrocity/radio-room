import { z } from "zod"
import type {
  ItemShopsShopCatalogEntry,
  ShopBuyContext,
  ShopSessionContext,
} from "@repo/plugin-base/helpers"
import { BasePlugin, applyTextEffects, ShoppingSessionHelper } from "@repo/plugin-base"
import { countFlagStacks } from "@repo/game-logic"
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
import { ITEM_CATALOG, ITEM_USE_BEHAVIORS, TEXT_EFFECT_KINDS } from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { itemShopsConfigSchema, defaultItemShopsConfig, type ItemShopsConfig } from "./types"

const PLUGIN_NAME = ITEM_SHOPS_PLUGIN_NAME

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
    this.clearShopTimersAndStateForGameEnd()
    await this.shopping.clearSessionRound()
    await this.stripOwnedItemsFromAllUsers()
  }

  /**
   * Clears shop-scoped timers and in-memory shop state. Used on room game session end only
   * (does not run shopping-round `onSessionEnd` hooks — inventory is stripped separately).
   */
  private clearShopTimersAndStateForGameEnd(): void {
    for (const shop of SHOP_CATALOG) {
      const prefix = this.shopTimerPrefix(shop.shopId)
      for (const timer of this.getAllTimers()) {
        if (timer.id.startsWith(prefix)) {
          this.clearTimer(timer.id)
        }
      }
    }
    this.shopStateStores.clear()
  }

  /**
   * Before ending or replacing a shopping round: run per-shop `onSessionEnd`.
   * Does not clear shop state stores globally — shops without hooks (e.g. Sweetwater timers) keep state.
   * Drops empty per-shop maps after a hook runs (e.g. Green Room clears its visitor keys).
   */
  private async invokeShoppingRoundSessionEndHooks(): Promise<void> {
    if (!this.context) return
    for (const shop of SHOP_CATALOG) {
      if (!shop.onSessionEnd) continue
      const ctx = this.createShopSessionContext(shop)
      await shop.onSessionEnd(ctx)
      const store = this.shopStateStores.get(shop.shopId)
      if (store && store.size === 0) {
        this.shopStateStores.delete(shop.shopId)
      }
    }
  }

  /** After `startSession`: optional per-shop `onSessionStart` for shops in this round's rotation. */
  private async invokeShoppingRoundSessionStartHooks(
    eligible: readonly ItemShopsShopCatalogEntry[],
  ): Promise<void> {
    if (!this.context) return
    for (const shop of eligible) {
      if (!shop.onSessionStart) continue
      const ctx = this.createShopSessionContext(shop)
      await shop.onSessionStart(ctx)
    }
  }

  private shopTimerPrefix(shopId: string): string {
    return `shop:${shopId}:`
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

      sendUserSystemMessage: async (targetUserId, message, meta) => {
        await this.context!.api.sendUserSystemMessage(
          this.context!.roomId,
          targetUserId,
          message,
          meta,
        )
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

  private createShopSessionContext(shop: ItemShopsShopCatalogEntry): ShopSessionContext {
    const timerPrefix = this.shopTimerPrefix(shop.shopId)
    const stateStore = this.getShopStateStore(shop.shopId)

    const ctx: ShopSessionContext = {
      roomId: this.context!.roomId,
      shopId: shop.shopId,
      pluginName: this.name,

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

      sendUserSystemMessage: async (targetUserId, message, meta) => {
        await this.context!.api.sendUserSystemMessage(
          this.context!.roomId,
          targetUserId,
          message,
          meta,
        )
      },

      getState: <T>(key: string) => stateStore.get(key) as T | undefined,
      setState: <T>(key: string, value: T) => {
        stateStore.set(key, value)
      },
      deleteState: (key) => {
        stateStore.delete(key)
      },
      getAllStateKeys: () => Array.from(stateStore.keys()),

      inventory: {
        getInventory: (userId) => this.context!.inventory.getInventory(userId),
        getItemDefinition: (definitionId) =>
          this.context!.inventory.getItemDefinition(definitionId),
        removeItem: (userId, itemId, quantity) =>
          this.context!.inventory.removeItem(userId, itemId, quantity),
        giveItem: (userId, definitionId, quantity, metadata, source) =>
          this.context!.inventory.giveItem(userId, definitionId, quantity, metadata, source),
      },
    }
    return ctx
  }

  private async handleUserJoined(data: SystemEventPayload<"USER_JOINED">): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled || !config.assignShopOnJoin) return
    if (!(await this.shopping.isActive())) return
    // Skip if user already has an assignment (e.g. page refresh during session)
    const existing = await this.shopping.getInstance(data.user.userId)
    if (existing) return
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
          action: "giveItemToUsers",
          label: "Give item to user(s)",
          showWhen: { field: "enabled", value: true },
          formFields: [
            {
              name: "itemShortId",
              label: "Item",
              type: "select",
              required: true,
              options: ITEM_CATALOG.map((e) => ({
                value: e.definition.shortId,
                label: e.definition.name,
              })),
            },
            {
              name: "userId",
              label: "Recipient",
              type: "user-select",
              required: true,
              options: [{ value: "__all__", label: "All users" }],
            },
          ],
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
          icon: "ShoppingCart",
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
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (action === "giveItemToUsers") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const session = await this.context.game.getActiveSession()
      if (!session) {
        return { success: false, message: "No active game session." }
      }
      const itemShortId =
        typeof params?.itemShortId === "string" ? params.itemShortId.trim() : ""
      const userIdParam = typeof params?.userId === "string" ? params.userId.trim() : ""
      if (!itemShortId || !userIdParam) {
        return { success: false, message: "Select an item and recipient." }
      }
      const known = ITEM_CATALOG.some((e) => e.definition.shortId === itemShortId)
      if (!known) {
        return { success: false, message: `Unknown item: ${itemShortId}` }
      }
      const defId = this.shopping.getDefinitionId(itemShortId)
      const itemName =
        ITEM_CATALOG.find((e) => e.definition.shortId === itemShortId)?.definition.name ??
        itemShortId

      if (userIdParam === "__all__") {
        const users = await this.context.api.getUsers(this.context.roomId)
        let ok = 0
        let failed = 0
        for (const u of users) {
          const row = await this.context.inventory.giveItem(
            u.userId,
            defId,
            1,
            undefined,
            "plugin",
          )
          if (row) ok++
          else failed++
        }
        if (users.length === 0) {
          return { success: false, message: "No users in this room." }
        }
        return {
          success: failed === 0 && ok > 0,
          message:
            ok === 0
              ? "Could not grant items (inventory may be full)."
              : failed > 0
                ? `Granted ${itemName} to ${ok} user(s); ${failed} could not receive it (inventory full?).`
                : `Granted ${itemName} to ${ok} user(s).`,
        }
      }

      const inRoom = await this.context.api.getUsers(this.context.roomId)
      if (!inRoom.some((u) => u.userId === userIdParam)) {
        return { success: false, message: "Selected user is not in this room." }
      }
      const row = await this.context.inventory.giveItem(
        userIdParam,
        defId,
        1,
        undefined,
        "plugin",
      )
      if (!row) {
        return {
          success: false,
          message: "Could not grant item (inventory may be full).",
        }
      }
      return {
        success: true,
        message: `Granted ${itemName}.`,
      }
    }
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
      await this.invokeShoppingRoundSessionEndHooks()
      const users = await this.context.api.getUsers(this.context.roomId)
      await this.shopping.startSession(users, eligible)
      await this.invokeShoppingRoundSessionStartHooks(eligible)
      await this.emit("SHOPPING_SESSION_STARTED", { roomId: this.context.roomId })
      return { success: true, message: "Shopping session started." }
    }
    if (action === "endShoppingSessions") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      await this.invokeShoppingRoundSessionEndHooks()
      await this.shopping.clearSessionRound()
      await this.emit("SHOPPING_SESSION_ENDED", { roomId: this.context.roomId })
      return { success: true, message: "All shopping sessions ended." }
    }
    /** Game Studio / sandbox: assign shops to users who joined before the shopping round (same rules as USER_JOINED). */
    if (action === "replayShopAssignmentsForExistingUsers") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      if (!config.assignShopOnJoin) {
        return {
          success: false,
          message:
            'Turn on "Assign shop when users join mid-session" in Item Shops settings (or reset sandbox defaults).',
        }
      }
      if (!(await this.shopping.isActive())) {
        return {
          success: false,
          message: "Start a shopping round first (toolbar → Start shopping).",
        }
      }
      const eligible = getEligibleShops(config)
      if (eligible.length === 0) {
        return {
          success: false,
          message: "Select at least one shop in Item Shops settings (Shops in rotation).",
        }
      }
      const users = await this.context.api.getUsers(this.context.roomId)
      let assigned = 0
      for (const u of users) {
        if (await this.shopping.getInstance(u.userId)) continue
        await this.shopping.assignInstanceForUserId(u.userId, Date.now(), eligible)
        assigned++
      }
      if (assigned > 0) {
        await this.emit("SHOPPING_SESSION_UPDATED", { roomId: this.context.roomId })
      }
      return {
        success: true,
        message:
          assigned === 0
            ? "Everyone already had a shop assignment."
            : `Assigned shops to ${assigned} user(s).`,
      }
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
    return super.executeAction(action, initiator, params)
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

    const stacks = countFlagStacks(state.modifiers, Date.now())
    const transformed = applyTextEffects(message.content, stacks, TEXT_EFFECT_KINDS)
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
