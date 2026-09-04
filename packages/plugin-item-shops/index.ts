import { z } from "zod"
import type {
  ItemShopsShopCatalogEntry,
  ShopBuyContext,
  ShopSessionContext,
} from "@repo/plugin-base/helpers"
import { BasePlugin, applyTextEffects, ShoppingSessionHelper } from "@repo/plugin-base"
import { countFlagStacks, resolveItemRarity, buildItemCatalogMap, filterShopCatalogByRoomType } from "@repo/game-logic"
import {
  type ChatMessage,
  type ContributeToUserGameStateContext,
  type DefenseTriggeredPayload,
  type DefenseTriggeredResult,
  type ItemDefinition,
  type ItemSellResult,
  type ItemUseResult,
  type MetadataSourceAccessGrantParams,
  type MetadataSourceAccessGrantResult,
  type PhysicalMediaItem,
  type Plugin,
  type PluginActionInitiator,
  type PluginAugmentationData,
  type PluginComponentSchema,
  type PluginConfigSchema,
  type InventoryItem,
  type QueueItem,
  type QueueValidationParams,
  type QueueValidationResult,
  type ShoppingSessionInstance,
  type SystemEventPayload,
} from "@repo/types"
import {
  isMediaCondition,
  MEDIA_CONDITION_LABELS,
  ITEM_SHOPS_PLUGIN_NAME,
  ITEM_SHOPS_TAB_ID,
  resolveSlotPool,
  SLOT_POOL_LABELS,
} from "@repo/types"
import packageJson from "./package.json"
import {
  ITEM_CATALOG,
  ITEM_USE_BEHAVIORS,
  ITEM_DEFENSE_TRIGGERED_BEHAVIORS,
  ITEM_SELLBACK_VALUE_BEHAVIORS,
  TEXT_EFFECT_KINDS,
  items,
} from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { buildEffectiveShopCatalog } from "./localLibrary/catalog"
import { itemShopsConfigSchema, defaultItemShopsConfig, type ItemShopsConfig } from "./types"
import { DEFAULT_LOCAL_LIBRARY_GRANTS } from "./types"
import {
  itemDefinitionAuthoringFieldMetas,
  LOCAL_LIBRARY_GRANT_USE_MESSAGE,
} from "./catalogFromConfig"
import { isLocalLibraryGrantShortId } from "./localLibraryGrants"
import { LocalLibraryModule } from "./localLibrary"
import { physicalMediaShopEconomyHooks } from "./localLibrary/shopEconomy"
import {
  conditionsWithinBounds,
  DEFAULT_OFFER_CONDITION_BOUNDS,
  OFFER_CONDITION_SELECT_OPTIONS,
  readOfferConditionBounds,
  type OfferConditionBounds,
} from "./localLibrary/condition"
import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"

const PLUGIN_NAME = ITEM_SHOPS_PLUGIN_NAME
const AUTO_SHOP_TIMER_ID = "auto-shop"
const MIN_AUTO_SHOP_INTERVAL_MS = 60_000

/**
 * Shops eligible for random assignment. `playbackControllerId` drops shops that
 * declare `requiresPlaybackControllerId` when the room controller does not match.
 * `roomType` strips SKUs whose `availableInRoomTypes` does not include the type
 * (ADR 0136).
 */
export function getEligibleShops(
  config: ItemShopsConfig,
  playbackControllerId?: string | null,
  derivedPhysicalMedia: readonly ItemCatalogEntry[] = [],
  roomType?: "jukebox" | "radio" | "live" | null,
): ItemShopsShopCatalogEntry[] {
  const shopCatalog = buildEffectiveShopCatalog(
    config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS,
    derivedPhysicalMedia,
  )
  const knownIds = new Set(shopCatalog.map((s) => s.shopId))
  const selected = new Set(config.enabledShopIds.filter((id) => knownIds.has(id)))
  const eligible = shopCatalog.filter((s) => {
    if (!selected.has(s.shopId)) return false
    if (s.requiresPlaybackControllerId && s.requiresPlaybackControllerId !== playbackControllerId) {
      return false
    }
    return true
  })
  if (!roomType) return eligible
  const catalogMap = buildItemCatalogMap([
    ...ITEM_CATALOG,
    ...derivedPhysicalMedia,
  ])
  return filterShopCatalogByRoomType(eligible, catalogMap, roomType)
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

  /** Synced from plugin config; `decorateOffer` reads this at instance-build time (ADR 0158). */
  private offerConditionBounds: OfferConditionBounds = { ...DEFAULT_OFFER_CONDITION_BOUNDS }

  private readonly localLibrary = new LocalLibraryModule(PLUGIN_NAME, () => this.context ?? undefined)
  /** Bumped on each local-library refresh so in-flight artwork hydrates abort. */
  private albumArtworkHydrateGeneration = 0

  /** Static + config + derived grant catalog. */
  private get grantCatalog(): ItemCatalogEntry[] {
    return this.localLibrary.grantCatalog
  }

  /** Per-shop state stores for `onBuy` callbacks (keyed by shopId, then by arbitrary key). */
  private shopStateStores = new Map<string, Map<string, unknown>>()

  async register(context: import("@repo/types").PluginContext): Promise<void> {
    await super.register(context)
    const config = await this.getConfig()
    this.syncOfferConditionBounds(config)
    await this.localLibrary.refreshDerivedPhysicalMedia(config?.physicalMediaOverrides ?? [], {
      derivePrefixedPlaylists: config?.derivePrefixedPlaylistsAsPhysicalMedia ?? true,
      deriveAlbums: config?.deriveAlbumsAsPhysicalMedia ?? false,
    })
    const grants = config?.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    const { itemCatalog, shopCatalog } = this.localLibrary.applyConfig(grants)
    this.shopping = new ShoppingSessionHelper(
      this.name,
      context,
      itemCatalog,
      shopCatalog,
      { hooks: physicalMediaShopEconomyHooks(() => this.offerConditionBounds) },
    )
    this.context!.inventory.registerItemDefinitions(itemCatalog.map((e) => e.definition))
    this.scheduleAlbumArtworkHydrate()
    this.on("GAME_SESSION_ENDED", this.handleGameSessionEnded.bind(this))
    this.on("GAME_SESSION_STARTED", this.handleGameSessionStarted.bind(this))
    this.on("USER_JOINED", this.handleUserJoined.bind(this))
    this.on("MEDIA_BRIDGE_STATUS_CHANGED", this.handleMediaBridgeStatusChanged.bind(this))
    this.onConfigChange(async () => {
      await this.applyLocalLibraryGrantConfig()
      await this.syncAutoShopTimer()
    })
    await this.syncAutoShopTimer()
  }

  private async handleGameSessionStarted(): Promise<void> {
    await this.syncAutoShopTimer()
  }

  private async handleMediaBridgeStatusChanged(): Promise<void> {
    await this.applyLocalLibraryGrantConfig()
  }

  private async applyLocalLibraryGrantConfig(): Promise<void> {
    if (!this.context || !this.shopping) return
    const config = await this.getConfig()
    this.syncOfferConditionBounds(config)
    await this.localLibrary.refreshDerivedPhysicalMedia(config?.physicalMediaOverrides ?? [], {
      derivePrefixedPlaylists: config?.derivePrefixedPlaylistsAsPhysicalMedia ?? true,
      deriveAlbums: config?.deriveAlbumsAsPhysicalMedia ?? false,
    })
    await this.resyncDerivedCatalogs()
    this.scheduleAlbumArtworkHydrate()
  }

  private syncOfferConditionBounds(config: ItemShopsConfig | null | undefined): void {
    this.offerConditionBounds = readOfferConditionBounds(config ?? {})
  }

  /** Re-apply grant + derived catalogs into shopping + inventory definitions. */
  private async resyncDerivedCatalogs(): Promise<void> {
    if (!this.context || !this.shopping) return
    const config = await this.getConfig()
    const grants = config?.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    const { itemCatalog, shopCatalog } = this.localLibrary.applyConfig(grants)
    this.shopping.replaceCatalogs({ itemCatalog, shopCatalog })
    await this.context.inventory.registerItemDefinitions(itemCatalog.map((e) => e.definition))
  }

  /** Non-blocking album sleeve fill after catalog-mode refresh (perf F3). */
  private scheduleAlbumArtworkHydrate(): void {
    const generation = ++this.albumArtworkHydrateGeneration
    void this.localLibrary
      .hydrateMissingAlbumArtwork({
        batchSize: 24,
        shouldContinue: () => generation === this.albumArtworkHydrateGeneration,
        onBatch: async (changedShortIds) => {
          if (generation !== this.albumArtworkHydrateGeneration) return
          await this.registerPatchedAlbumDefinitions(changedShortIds)
        },
      })
      .catch((err) => {
        console.warn("[item-shops] album artwork hydrate failed:", err)
      })
  }

  private giveItemPickerEntries(): ItemCatalogEntry[] {
    return this.effectiveCatalogForGive().filter(
      (e) => e.localLibraryGrant?.scope !== "album",
    )
  }

  /**
   * Re-apply grant + derived catalogs in memory and HSET only the given SKUs
   * (album sleeve hydrate). Full {@link resyncDerivedCatalogs} still runs after
   * a derivation refresh so new ids are registered.
   */
  private async registerPatchedAlbumDefinitions(shortIds: readonly string[]): Promise<void> {
    if (!this.context || !this.shopping || shortIds.length === 0) return
    const config = await this.getConfig()
    const grants = config?.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    const { itemCatalog, shopCatalog } = this.localLibrary.applyConfig(grants)
    this.shopping.replaceCatalogs({ itemCatalog, shopCatalog })
    const wanted = new Set(shortIds.map((id) => id.trim()).filter(Boolean))
    const defs = itemCatalog
      .filter((e) => wanted.has(e.definition.shortId))
      .map((e) => e.definition)
    if (defs.length > 0) {
      await this.context.inventory.registerItemDefinitions(defs)
    }
  }

  private effectiveCatalogForGive(): ItemCatalogEntry[] {
    const seen = new Set<string>()
    const out: ItemCatalogEntry[] = []
    for (const e of [...ITEM_CATALOG, ...this.grantCatalog]) {
      if (seen.has(e.definition.shortId)) continue
      seen.add(e.definition.shortId)
      out.push(e)
    }
    return out
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
    const eligible = await this.resolveEligibleShops(config)
    if (eligible.length === 0) return
    await this.shopping.assignInstanceForUserId(data.user.userId, Date.now(), eligible)
    await this.emit("SHOPPING_SESSION_UPDATED", { roomId: this.context.roomId })
    await this.requestShopTabAttention(data.user.userId)
  }

  private async resolveEligibleShops(
    config: ItemShopsConfig,
  ): Promise<ItemShopsShopCatalogEntry[]> {
    const room = await this.context!.getRoom()
    return getEligibleShops(
      config,
      room?.playbackControllerId,
      this.localLibrary.derivedPhysicalMedia,
      room?.type,
    )
  }

  /** Badge the Item Shop game-state tab until the user opens it. */
  private async requestShopTabAttention(userId: string): Promise<void> {
    if (!this.context) return
    await this.context.api.requestGameStateTabAttention({
      userId,
      tabId: ITEM_SHOPS_TAB_ID,
    })
  }

  private resolveAutoShopIntervalMs(config: ItemShopsConfig): number {
    return Math.max(MIN_AUTO_SHOP_INTERVAL_MS, config.autoShopIntervalMs ?? 10 * 60_000)
  }

  private async syncAutoShopTimer(): Promise<void> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    if (!this.context || !config.enabled || !config.autoShop) {
      this.clearTimer(AUTO_SHOP_TIMER_ID)
      return
    }
    const duration = this.resolveAutoShopIntervalMs(config)
    this.startTimer(AUTO_SHOP_TIMER_ID, {
      duration,
      callback: async () => {
        await this.onAutoShopTick()
      },
    })
  }

  private async onAutoShopTick(): Promise<void> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    if (!this.context || !config.enabled || !config.autoShop) {
      return
    }
    const gameSession = await this.context.game.getActiveSession()
    if (!gameSession) {
      await this.syncAutoShopTimer()
      return
    }
    const eligible = await this.resolveEligibleShops(config)
    if (eligible.length === 0) {
      await this.syncAutoShopTimer()
      return
    }
    await this.openShoppingRound(config)
    await this.syncAutoShopTimer()
  }

  private async openShoppingRound(
    config: ItemShopsConfig,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const eligible = await this.resolveEligibleShops(config)
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
    for (const u of users) {
      await this.requestShopTabAttention(u.userId)
    }
    return { success: true, message: "Shopping session started." }
  }

  private async persistConfigPatch(
    initiator: PluginActionInitiator | undefined,
    patch: Partial<ItemShopsConfig>,
    message: string,
  ): Promise<
    | { success: true; message: string; configPatch: Partial<ItemShopsConfig> }
    | { success: false; message: string }
  > {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }
    const current = (await this.getConfig()) ?? defaultItemShopsConfig
    const next = { ...current, ...patch }
    await this.context.api.setPluginConfig(this.context.roomId, this.name, next)
    // Keep in-memory cache aligned with what we just wrote (PluginAPI.setPluginConfig
    // does not emit CONFIG_CHANGED, so getConfig() would otherwise stay stale).
    ;(this as { configCache?: ItemShopsConfig | null }).configCache = next
    this.syncOfferConditionBounds(next)
    await this.syncAutoShopTimer()
    const keys = Object.keys(patch) as (keyof ItemShopsConfig)[]
    const configPatch = Object.fromEntries(keys.map((k) => [k, next[k]])) as Partial<ItemShopsConfig>
    if ("autoShopIntervalMs" in patch) {
      configPatch.autoShop = next.autoShop
    }
    return { success: true, message, configPatch }
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
        {
          type: "text-block",
          content:
            "Record Store (Physical Media) only appears in Media Bridge rooms. Stock it from prefixed Navidrome playlists ([CD], [LP], [TAPE], [45]) and/or every album in the library (toggles below). When both are on, an album that exactly matches a derived playlist’s track list (same songs, same order) is skipped so the playlist SKU wins. Set Library to “Admins + plugin grants only” under Content → Media sources if you want Local access to flow through held items.",
          variant: "info",
        },
        "enabled",
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
        {
          type: "action",
          action: "giveItemToUsers",
          label: "Give item to user(s)",
          showWhen: { field: "enabled", value: true },
          formFields: [
            {
              name: "itemShortId",
              label: "Item",
              type: "combobox",
              required: true,
              placeholder: "Search items or paste a catalog-mode short id (pm-al-…)",
              options: this.giveItemPickerEntries().map((e) => ({
                value: e.definition.shortId,
                label: e.definition.artist?.trim()
                  ? `${e.definition.name} (${e.definition.artist.trim()})`
                  : e.definition.name,
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
        "enabledShopIds",
        "assignShopOnJoin",
        {
          type: "heading",
          content: "Auto-shop",
          showWhen: { field: "enabled", value: true },
        },
        {
          type: "text-block",
          content:
            "When auto-shop is on, a new shopping round opens for everyone on the interval below. Manual Start still opens immediately and resets the countdown. Auto-shop ticks require an active game session.",
          variant: "info",
          showWhen: { field: "enabled", value: true },
        },
        "autoShop",
        "autoShopIntervalMs",
        {
          type: "action",
          action: "enableAutoShop",
          label: "Enable auto-shop",
          variant: "outline",
          showWhen: [
            { field: "enabled", value: true },
            { field: "autoShop", value: false },
          ],
        },
        {
          type: "action",
          action: "disableAutoShop",
          label: "Disable auto-shop",
          variant: "outline",
          showWhen: [
            { field: "enabled", value: true },
            { field: "autoShop", value: true },
          ],
        },
        {
          type: "action",
          action: "setAutoShopInterval",
          label: "Set auto-shop interval",
          variant: "outline",
          showWhen: { field: "enabled", value: true },
          formFields: [
            {
              name: "intervalMinutes",
              label: "Interval (minutes)",
              type: "string",
              required: true,
              placeholder: "10",
              seedFromField: "autoShopIntervalMs",
              seedDivide: 60_000,
            },
          ],
        },
        {
          type: "heading",
          content: "Physical Media",
          showWhen: { field: "enabled", value: true },
        },
        "showPhysicalMediaFrameInNowPlaying",
        "derivePrefixedPlaylistsAsPhysicalMedia",
        "deriveAlbumsAsPhysicalMedia",
        {
          type: "text-block",
          content:
            "Condition range applies only to derived Record Store copies (CDs, LPs, tapes, 45s). Existing offers keep the condition they rolled until you start a new shopping session.",
          variant: "info",
          showWhen: { field: "enabled", value: true },
        },
        {
          type: "action",
          action: "setOfferConditionRange",
          label: "Set Record Store condition range",
          variant: "outline",
          showWhen: { field: "enabled", value: true },
          formFields: [
            {
              name: "offerConditionMin",
              label: "Worst condition",
              type: "select",
              required: true,
              seedFromField: "offerConditionMin",
              options: [...OFFER_CONDITION_SELECT_OPTIONS],
            },
            {
              name: "offerConditionMax",
              label: "Best condition",
              type: "select",
              required: true,
              seedFromField: "offerConditionMax",
              options: [...OFFER_CONDITION_SELECT_OPTIONS],
            },
          ],
        },
        "physicalMediaOverrides",
        {
          type: "heading",
          content: "Local Library",
          showWhen: { field: "enabled", value: true },
        },
        "localLibraryGrants",
        {
          type: "action",
          action: "refreshLocalLibrary",
          label: "Refresh local library",
          variant: "outline",
          confirmMessage:
            "Clear the Media Bridge playlist cache so the next browse/search reloads from Navidrome?",
          confirmText: "Refresh",
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
          options: [
            ...SHOP_CATALOG.map((s) => ({ value: s.shopId, label: s.name })),
            { value: "record-store", label: "Record Store" },
          ],
          showWhen: { field: "enabled", value: true },
        },
        assignShopOnJoin: {
          type: "boolean",
          label: "Assign shop when users join mid-session",
          description:
            "If a shopping round is active, give late joiners their own random shop instance.",
          showWhen: { field: "enabled", value: true },
        },
        autoShop: {
          type: "boolean",
          label: "Auto-shop",
          description: "Automatically open a new shopping round on the interval below.",
          showWhen: { field: "enabled", value: true },
        },
        autoShopIntervalMs: {
          type: "duration",
          label: "Auto-shop interval",
          description: "How long to wait between automatic shopping rounds.",
          displayUnit: "minutes",
          storageUnit: "milliseconds",
          showWhen: [
            { field: "enabled", value: true },
            { field: "autoShop", value: true },
          ],
        },
        showPhysicalMediaFrameInNowPlaying: {
          type: "boolean",
          label: "Show Physical Media sleeves in the room",
          description:
            "When a Local track lives on a derived record (LP, CD, cassette, or 45), Now Playing, the Queue, and the Playlist use that sleeve or case. If the record has no cover, the track's album art fills the frame.",
          showWhen: { field: "enabled", value: true },
        },
        derivePrefixedPlaylistsAsPhysicalMedia: {
          type: "boolean",
          label: "Stock Record Store from prefixed playlists",
          description:
            "Derive Physical Media from Navidrome playlists named with [CD], [LP], [TAPE], or [45]. Optional rarity tags: [COMMON], [UNCOMMON], [RARE], [LEGENDARY] (any order with the format tag, e.g. [LP][RARE] Loveless). Untagged playlists are common. Turn off when you only want album-catalog items.",
          showWhen: { field: "enabled", value: true },
        },
        deriveAlbumsAsPhysicalMedia: {
          type: "boolean",
          label: "Stock Record Store from every album",
          description:
            "Create a Physical Media item for each Navidrome album (format inferred from year and track count). Rarity comes from your Navidrome star rating (unrated = common); price still follows track count. Albums that exactly match a derived prefixed playlist are omitted — the playlist item inherits those stars unless you tagged or overrode rarity. Requires a current DJ Mac Media Bridge pack.",
          showWhen: { field: "enabled", value: true },
        },
        offerConditionMin: {
          type: "enum",
          label: "Worst condition",
          description:
            "Most worn Record Store copies that can appear in a shopping round. With Best at Mint this is the full Poor–Mint range. Applies to the next round, not offers already on the table.",
          showWhen: { field: "enabled", value: true },
          enumLabels: {
            poor: "Poor",
            good: "Good",
            mint: "Mint",
          },
        },
        offerConditionMax: {
          type: "enum",
          label: "Best condition",
          description:
            "Most pristine Record Store copies that can appear in a shopping round. Default Mint.",
          showWhen: { field: "enabled", value: true },
          enumLabels: {
            mint: "Mint",
            good: "Good",
            poor: "Poor",
          },
        },
        localLibraryGrants: {
          type: "object-array",
          label: "Extra local library grants",
          description:
            "Optional extra SKUs beyond derived Physical Media. Playlist shelves need a Navidrome playlist id.",
          itemLabel: "Grant",
          showWhen: { field: "enabled", value: true },
          itemFields: [
            ...itemDefinitionAuthoringFieldMetas(),
            {
              name: "scope",
              meta: {
                type: "enum",
                label: "Access scope",
                options: [
                  { value: "playlist", label: "Playlist shelf" },
                  { value: "library", label: "Full library" },
                ],
              },
            },
            {
              name: "redemption",
              meta: {
                type: "enum",
                label: "Redemption",
                options: [
                  { value: "perQueue", label: "Per queue (consumable)" },
                  { value: "durable", label: "Durable (session collection)" },
                ],
              },
            },
            {
              name: "playlistId",
              meta: {
                type: "remote-select",
                label: "Navidrome playlist",
                description: "Required for playlist shelves. Loaded from the Media Bridge when connected.",
                remoteSource: "bridgeLocalPlaylists",
                showWhen: { field: "scope", value: "playlist" },
              },
            },
          ],
        },
        physicalMediaOverrides: {
          type: "object-array",
          label: "Physical Media overrides",
          description:
            "Optional name/price/rarity/icon overrides for derived Record Store items, keyed by Navidrome playlist id. Use Blank disc for jewel-case CDs without a real sleeve.",
          itemLabel: "Override",
          showWhen: { field: "enabled", value: true },
          itemFields: [
            {
              name: "playlistId",
              meta: {
                type: "remote-select",
                label: "Navidrome playlist",
                remoteSource: "bridgeLocalPlaylists",
              },
            },
            { name: "name", meta: { type: "string", label: "Display name" } },
            { name: "coinValue", meta: { type: "number", label: "Shop price (coins)" } },
            {
              name: "rarity",
              meta: {
                type: "enum",
                label: "Rarity",
                options: [
                  { value: "common", label: "Common" },
                  { value: "uncommon", label: "Uncommon" },
                  { value: "rare", label: "Rare" },
                  { value: "legendary", label: "Legendary" },
                ],
              },
            },
            { name: "icon", meta: { type: "string", label: "Icon (Lucide)" } },
            {
              name: "blankDisc",
              meta: {
                type: "boolean",
                label: "Blank disc",
                description:
                  "Ignore Navidrome playlist art and show the title hand-lettered on the CD (jewel case only).",
              },
            },
          ],
        },
      },
      quickAccessStatus: ["autoShop", "autoShopIntervalMs"],
      quickAccess: [
        "enableAutoShop",
        "disableAutoShop",
        "setAutoShopInterval",
        "setOfferConditionRange",
        "startShoppingSession",
        "endShoppingSessions",
        "refreshLocalLibrary",
      ],
    }
  }

  getComponentSchema(): PluginComponentSchema {
    return {
      components: [
        {
          id: ITEM_SHOPS_TAB_ID,
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
  ): Promise<{ success: boolean; message?: string; configPatch?: Record<string, unknown> }> {
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
      const itemShortId = typeof params?.itemShortId === "string" ? params.itemShortId.trim() : ""
      const userIdParam = typeof params?.userId === "string" ? params.userId.trim() : ""
      if (!itemShortId || !userIdParam) {
        return { success: false, message: "Select an item and recipient." }
      }
      const known = this.effectiveCatalogForGive().some((e) => e.definition.shortId === itemShortId)
      if (!known) {
        return { success: false, message: `Unknown item: ${itemShortId}` }
      }
      if (this.localLibrary.isGrantShortId(itemShortId)) {
        const room = await this.context.getRoom()
        if (room?.playbackControllerId !== "bridge") {
          return {
            success: false,
            message: "Local library grant items can only be given in Media Bridge rooms.",
          }
        }
      }
      const defId = this.shopping.getDefinitionId(itemShortId)
      const catalogEntry = this.effectiveCatalogForGive().find(
        (e) => e.definition.shortId === itemShortId,
      )
      const itemName = catalogEntry?.definition.name ?? itemShortId
      const poolLabel = SLOT_POOL_LABELS[resolveSlotPool(catalogEntry?.definition)]

      if (userIdParam === "__all__") {
        const users = await this.context.api.getUsers(this.context.roomId)
        let ok = 0
        let failed = 0
        for (const u of users) {
          const row = await this.context.inventory.giveItem(u.userId, defId, 1, undefined, "plugin")
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
              ? `Could not grant items (${poolLabel} may be full).`
              : failed > 0
                ? `Granted ${itemName} to ${ok} user(s); ${failed} could not receive it (${poolLabel} full?).`
                : `Granted ${itemName} to ${ok} user(s).`,
        }
      }

      const inRoom = await this.context.api.getUsers(this.context.roomId)
      if (!inRoom.some((u) => u.userId === userIdParam)) {
        return { success: false, message: "Selected user is not in this room." }
      }
      const row = await this.context.inventory.giveItem(userIdParam, defId, 1, undefined, "plugin")
      if (!row) {
        return {
          success: false,
          message: `Could not grant item (${poolLabel} may be full).`,
        }
      }
      return {
        success: true,
        message: `Granted ${itemName}.`,
      }
    }
    if (action === "enableAutoShop") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      return this.persistConfigPatch(initiator, { autoShop: true }, "Auto-shop enabled.")
    }
    if (action === "disableAutoShop") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      return this.persistConfigPatch(initiator, { autoShop: false }, "Auto-shop disabled.")
    }
    if (action === "setAutoShopInterval") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const raw = params?.intervalMinutes
      const minutes =
        typeof raw === "number"
          ? raw
          : Number.parseInt(typeof raw === "string" ? raw.trim() : "", 10)
      if (!Number.isFinite(minutes) || minutes < 1) {
        return { success: false, message: "Interval must be at least 1 minute." }
      }
      const autoShopIntervalMs = Math.max(MIN_AUTO_SHOP_INTERVAL_MS, minutes * 60_000)
      return this.persistConfigPatch(
        initiator,
        { autoShopIntervalMs },
        `Auto-shop interval set to ${Math.round(autoShopIntervalMs / 60_000)} minutes.`,
      )
    }
    if (action === "setOfferConditionRange") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const min = params?.offerConditionMin
      const max = params?.offerConditionMax
      if (!isMediaCondition(min) || !isMediaCondition(max)) {
        return { success: false, message: "Choose a worst and best condition." }
      }
      const allowed = conditionsWithinBounds(min, max)
      const range =
        allowed.length === 1
          ? `only ${MEDIA_CONDITION_LABELS[allowed[0]!]}`
          : allowed.map((c) => MEDIA_CONDITION_LABELS[c]).join(", ")
      return this.persistConfigPatch(
        initiator,
        { offerConditionMin: min, offerConditionMax: max },
        `Record Store offers will be ${range}.`,
      )
    }
    if (action === "startShoppingSession") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      const result = await this.openShoppingRound(config)
      if (result.success) {
        await this.syncAutoShopTimer()
      }
      return result
    }
    if (action === "endShoppingSessions") {
      if (!config?.enabled) {
        return { success: false, message: "Item Shops are disabled." }
      }
      await this.invokeShoppingRoundSessionEndHooks()
      await this.shopping.clearSessionRound()
      await this.emit("SHOPPING_SESSION_ENDED", { roomId: this.context.roomId })
      await this.syncAutoShopTimer()
      return { success: true, message: "All shopping sessions ended." }
    }
    if (action === "refreshLocalLibrary") {
      const room = await this.context.getRoom()
      if (room?.playbackControllerId !== "bridge") {
        return {
          success: false,
          message: "Refresh local library is only available in Media Bridge rooms.",
        }
      }
      const ok = await this.context.api.invalidateLocalLibraryCache(this.context.roomId)
      await this.applyLocalLibraryGrantConfig()
      return ok
        ? { success: true, message: "Local library cache cleared and Record Store restocked from Navidrome." }
        : { success: false, message: "Could not reach the Media Bridge to refresh the library." }
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
      const eligible = await this.resolveEligibleShops(config)
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
        await this.requestShopTabAttention(u.userId)
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
      if (isLocalLibraryGrantShortId(definition.shortId, this.grantCatalog)) {
        return {
          success: false,
          consumed: false,
          message: LOCAL_LIBRARY_GRANT_USE_MESSAGE,
        }
      }
      return { success: false, consumed: false, message: `Unknown item: ${definition.shortId}` }
    }

    return handler(
      {
        pluginName: this.name,
        context: this.context,
        game: this.game,
        activeInventoryItem: _item,
      },
      userId,
      definition,
      callContext,
    )
  }

  async grantMetadataSourceAccess(
    params: MetadataSourceAccessGrantParams,
  ): Promise<MetadataSourceAccessGrantResult> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    return this.localLibrary.grantMetadataSourceAccess(params, config)
  }

  /**
   * Catalog filter for restricted Local search/browse (ADR 0098).
   * `unrestricted` = full library; `playlists` = Navidrome playlist id union.
   */
  async resolveLocalLibraryCatalogFilter(params: {
    roomId: string
    userId: string
  }): Promise<
    | { mode: "unrestricted" }
    | { mode: "playlists"; playlistIds: string[]; albumIds: string[] }
    | "abstain"
  > {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    return this.localLibrary.resolveLocalLibraryCatalogFilter({
      ...params,
      enabled: config.enabled,
      grants: config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS,
    })
  }

  async listPhysicalMediaItems(params: { roomId: string; userId: string }): Promise<PhysicalMediaItem[]> {
    const items = await this.localLibrary.listPhysicalMediaItems(params.userId)
    const albumShortIds = items
      .filter((item) => this.localLibrary.albumMap()[item.mediaKey])
      .map((item) => item.mediaKey)
    if (albumShortIds.length > 0) {
      void this.localLibrary
        .ensureAlbumArtworkForShortIds(albumShortIds)
        .then(async (changed) => {
          if (changed.length === 0) return
          await this.registerPatchedAlbumDefinitions(changed)
        })
        .catch((err) => {
          console.warn("[item-shops] held album artwork failed:", err)
        })
    }
    return items
  }

  async resolvePhysicalMediaItem(params: {
    roomId: string
    userId: string
    mediaKey: string
  }): Promise<import("@repo/types").ResolvedPhysicalMediaItem | null> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    return this.localLibrary.resolveHeldPhysicalMediaItem(
      params.userId,
      params.mediaKey,
      config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS,
    )
  }

  async resolvePreviewableMediaItem(params: {
    roomId: string
    userId: string
    mediaKey: string
  }): Promise<import("@repo/types").ResolvedPhysicalMediaItem | null> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    const grants = config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    let shopOfferShortIds: string[] | undefined
    if (this.shopping && (await this.shopping.isActive())) {
      const inst = await this.shopping.getInstance(params.userId)
      if (inst) {
        shopOfferShortIds = inst.offers.map((o) => o.shortId)
      }
    }
    return this.localLibrary.resolvePreviewablePhysicalMediaItem(
      params.userId,
      params.mediaKey,
      grants,
      shopOfferShortIds,
    )
  }

  async validateQueueRequest(params: QueueValidationParams): Promise<QueueValidationResult> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    return this.localLibrary.validateQueueRequest(params, config)
  }

  private async augmentPhysicalMediaFrames(
    items: QueueItem[],
  ): Promise<PluginAugmentationData[]> {
    const config = (await this.getConfig()) ?? defaultItemShopsConfig
    if (!config.enabled || items.length === 0) return items.map(() => ({}))

    const localIds = items.map((item) =>
      item.mediaSource?.type === "local" ? (item.mediaSource.trackId?.trim() ?? "") : "",
    )
    const frames = await this.localLibrary.resolveNowPlayingFrames(localIds.filter(Boolean))
    return localIds.map((id) => {
      const physicalMediaFrame = id ? frames.get(id) : undefined
      return physicalMediaFrame ? { physicalMediaFrame } : {}
    })
  }

  async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
    const [augmentation] = await this.augmentPhysicalMediaFrames([item])
    return augmentation ?? {}
  }

  async augmentQueueBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    return this.augmentPhysicalMediaFrames(items)
  }

  async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    return this.augmentPhysicalMediaFrames(items)
  }

  async getSellbackValues(
    items: InventoryItem[],
    definitionById: Map<string, ItemDefinition>,
  ): Promise<Record<string, number>> {
    if (!this.context) {
      return {}
    }
    const config = await this.getConfig()
    if (!config?.enabled) {
      return {}
    }
    const out: Record<string, number> = {}
    for (const item of items) {
      const def = definitionById.get(item.definitionId)
      if (!def || def.sourcePlugin !== this.name) continue
      const handler = ITEM_SELLBACK_VALUE_BEHAVIORS[def.shortId]
      if (!handler) continue
      out[item.itemId] = handler(item, def)
    }
    return out
  }

  /**
   * Private per-user shop visit for `USER_GAME_STATE` (ADR 0097).
   */
  async contributeToUserGameState(
    userId: string,
    ctx: ContributeToUserGameStateContext,
  ): Promise<Record<string, unknown> | null> {
    if (!this.context || !this.shopping) return null

    const active = await this.shopping.isActive()
    if (!active) {
      return { currentShopInstance: null }
    }

    const instance = await this.shopping.getInstance(userId)
    if (instance?.offers.length) {
      const patched = await this.localLibrary.ensureAlbumArtworkForShortIds(
        instance.offers.map((o) => o.shortId),
      )
      if (patched.length > 0) await this.registerPatchedAlbumDefinitions(patched)
    }

    // Wire itemDefinitions may predate lazy sleeve fill — merge derived catalog art.
    const offerShortIds = instance?.offers.map((o) => o.shortId).filter(Boolean) ?? []
    const mergedDefs = this.mergeDefinitionsWithDerived(ctx.itemDefinitions, offerShortIds)

    return {
      currentShopInstance: this.enrichOfferArtworkAndRarity(instance, mergedDefs),
    }
  }

  private mergeDefinitionsWithDerived(
    itemDefinitions: ItemDefinition[],
    shortIds?: readonly string[],
  ): ItemDefinition[] {
    const wanted =
      shortIds && shortIds.length > 0
        ? new Set(shortIds.map((id) => id.trim()).filter(Boolean))
        : null
    const byId = new Map(itemDefinitions.map((d) => [d.id, { ...d }]))
    for (const entry of this.localLibrary.derivedPhysicalMedia) {
      if (wanted && !wanted.has(entry.definition.shortId)) continue
      const id = `${this.name}:${entry.definition.shortId}`
      const existing = byId.get(id)
      if (!existing) {
        byId.set(id, {
          ...entry.definition,
          id,
          sourcePlugin: this.name,
        } as ItemDefinition)
        continue
      }
      byId.set(id, {
        ...existing,
        ...entry.definition,
        id,
        sourcePlugin: this.name,
      } as ItemDefinition)
    }
    return [...byId.values()]
  }

  /**
   * Shop offer rows need their ItemDefinitions on the wire for `detailView`
   * (CurrentShopOffers). Inventory/modifier ids are collected by core.
   */
  async referencedItemDefinitionIdsForUser(userId: string): Promise<string[]> {
    if (!this.shopping) return []
    if (!(await this.shopping.isActive())) return []
    const instance = await this.shopping.getInstance(userId)
    if (!instance) return []
    const ids = new Set<string>()
    for (const offer of instance.offers) {
      const shortId = offer.shortId?.trim()
      if (shortId) ids.add(`${this.name}:${shortId}`)
    }
    return [...ids]
  }

  /** Hydrate legacy persisted offers that omit `rarity` / sleeve URLs. */
  private enrichOfferArtworkAndRarity(
    instance: ShoppingSessionInstance | null,
    itemDefinitions: ItemDefinition[],
  ): ShoppingSessionInstance | null {
    if (!instance) return null
    const byShortId = new Map<string, ItemDefinition>()
    for (const def of itemDefinitions) {
      if (def.sourcePlugin === this.name) {
        byShortId.set(def.shortId, def)
      }
    }
    return {
      ...instance,
      offers: instance.offers.map((offer) => {
        const def = byShortId.get(offer.shortId)
        return {
          ...offer,
          rarity: offer.rarity ?? resolveItemRarity(def ?? {}),
          imageUrl: offer.imageUrl ?? def?.imageUrl,
          imageUrlLarge: offer.imageUrlLarge ?? def?.imageUrlLarge,
          artworkFrame: offer.artworkFrame ?? def?.artworkFrame,
          mediaFormat: offer.mediaFormat ?? def?.mediaFormat,
          condition: offer.condition,
        }
      }),
    }
  }

  async onDefenseTriggered(
    payload: DefenseTriggeredPayload,
  ): Promise<DefenseTriggeredResult | null> {
    if (!this.context) {
      return null
    }
    const config = await this.getConfig()
    if (!config?.enabled) {
      return null
    }

    const handler = ITEM_DEFENSE_TRIGGERED_BEHAVIORS[payload.defenseItemDefinition.shortId]
    if (!handler) {
      return null
    }

    return handler(
      {
        pluginName: this.name,
        context: this.context,
        game: this.game,
      },
      payload,
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

    if (!definition.tradeable) {
      return {
        success: false,
        message: `${definition.name} cannot be sold back to shops.`,
      }
    }

    const customSellback = ITEM_SELLBACK_VALUE_BEHAVIORS[definition.shortId]
    if (customSellback) {
      const active = await this.shopping.isActive()
      if (!active) {
        return { success: false, message: "No shopping session is open right now." }
      }
      const inst = await this.shopping.getInstance(userId)
      if (!inst) {
        return { success: false, message: "You can only sell while your shop visit is open." }
      }
      const session = await this.context.game.getActiveSession()
      if (!session) {
        return { success: false, message: "No active game session." }
      }

      const refund = Math.max(0, Math.floor(customSellback(item, definition)))
      const removed = await this.context.inventory.removeItem(userId, item.itemId, 1)
      if (!removed) {
        return { success: false, message: `Could not remove ${definition.name} from inventory.` }
      }
      if (refund > 0) {
        await this.game.addScore(userId, "coin", refund, `${this.name}:sale`)
      }

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `${username} sold a ${definition.name} back for ${refund} coins.`,
      )

      return {
        success: true,
        message: `Sold ${definition.name} for ${refund} coins.`,
        refund,
      }
    }

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
