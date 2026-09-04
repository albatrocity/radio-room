import { describe, expect, it, vi, beforeEach } from "vitest"
import { ShoppingSessionHelper } from "@repo/plugin-base"
import type { PluginActionInitiator } from "@repo/types"
import { ItemShopsPlugin } from "./index"
import { ITEM_CATALOG } from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { defaultItemShopsConfig } from "./types"

const ADMIN: PluginActionInitiator = { userId: "admin-1", username: "Admin" }

function createMockContext(overrides?: {
  getActiveSession?: () => Promise<{ id: string } | null>
  isRoomAdmin?: boolean
}) {
  const setPluginConfig = vi.fn(async () => {})
  const getUsers = vi.fn(async () => [{ userId: "u1", username: "Listener" }])
  const getRoom = vi.fn(async () => ({ playbackControllerId: "spotify" }))
  const getActiveSession =
    overrides?.getActiveSession ??
    vi.fn(async () => ({ id: "game-1", roomId: "room-1", status: "active" as const, startedAt: 0, config: {} }))

  const context = {
    roomId: "room-1",
    storage: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      del: vi.fn(async () => {}),
      hget: vi.fn(async () => null),
      hset: vi.fn(async () => {}),
    },
    api: {
      getUsers,
      getUsersByIds: vi.fn(async () => []),
      isRoomAdmin: vi.fn(async () => overrides?.isRoomAdmin ?? true),
      sendSystemMessage: vi.fn(async () => {}),
      sendUserSystemMessage: vi.fn(async () => {}),
      requestGameStateTabAttention: vi.fn(async () => {}),
      setPluginConfig,
      getPluginConfig: vi.fn(async () => null),
    },
    game: { getActiveSession },
    inventory: {
      registerItemDefinitions: vi.fn(async () => {}),
      getInventory: vi.fn(async () => ({ items: [] })),
    },
    getRoom,
  }

  return { context: context as any, setPluginConfig, getActiveSession }
}

describe("ItemShopsPlugin auto-shop", () => {
  let plugin: ItemShopsPlugin

  beforeEach(() => {
    plugin = new ItemShopsPlugin({
      enabled: true,
      autoShop: true,
      autoShopIntervalMs: 10 * 60_000,
    })
  })

  it("arms the auto-shop timer when enabled", async () => {
    const startTimer = vi.spyOn(plugin as any, "startTimer")
    const clearTimer = vi.spyOn(plugin as any, "clearTimer")
    const { context } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )

    await (plugin as any).syncAutoShopTimer()

    expect(startTimer).toHaveBeenCalledWith(
      "auto-shop",
      expect.objectContaining({ duration: 10 * 60_000 }),
    )
  })

  it("clears the auto-shop timer when auto-shop is off", async () => {
    plugin = new ItemShopsPlugin({ enabled: true, autoShop: false })
    const clearTimer = vi.spyOn(plugin as any, "clearTimer")
    const startTimer = vi.spyOn(plugin as any, "startTimer")
    const { context } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )

    await (plugin as any).syncAutoShopTimer()

    expect(clearTimer).toHaveBeenCalledWith("auto-shop")
    expect(startTimer).not.toHaveBeenCalled()
  })

  it("skips auto tick without an active game session but re-arms the timer", async () => {
    const openShoppingRound = vi.spyOn(plugin as any, "openShoppingRound")
    const syncAutoShopTimer = vi.spyOn(plugin as any, "syncAutoShopTimer")
    const { context, getActiveSession } = createMockContext({
      getActiveSession: vi.fn(async () => null),
    })
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
      autoShop: true,
      autoShopIntervalMs: 10 * 60_000,
    })

    await (plugin as any).onAutoShopTick()

    expect(getActiveSession).toHaveBeenCalled()
    expect(openShoppingRound).not.toHaveBeenCalled()
    expect(syncAutoShopTimer).toHaveBeenCalled()
  })

  it("opens a shopping round on auto tick when a game session is active", async () => {
    const openShoppingRound = vi
      .spyOn(plugin as any, "openShoppingRound")
      .mockResolvedValue({ success: true, message: "Shopping session started." })
    const syncAutoShopTimer = vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
    const { context } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
      autoShop: true,
      autoShopIntervalMs: 10 * 60_000,
    })

    await (plugin as any).onAutoShopTick()

    expect(openShoppingRound).toHaveBeenCalled()
    expect(syncAutoShopTimer).toHaveBeenCalled()
  })

  it("restarts the auto-shop timer after a manual start", async () => {
    const syncAutoShopTimer = vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
    vi.spyOn(plugin as any, "openShoppingRound").mockResolvedValue({
      success: true,
      message: "Shopping session started.",
    })
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
      autoShop: true,
    })
    const { context } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = { startSession: vi.fn(), clearSessionRound: vi.fn() }

    const result = await plugin.executeAction("startShoppingSession", ADMIN)

    expect(result.success).toBe(true)
    expect(syncAutoShopTimer).toHaveBeenCalled()
  })

  it("enableAutoShop persists merged config via setPluginConfig", async () => {
    const syncAutoShopTimer = vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
    const { context, setPluginConfig } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = { startSession: vi.fn(), clearSessionRound: vi.fn() }
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
      autoShop: false,
    })

    const result = await plugin.executeAction("enableAutoShop", ADMIN)

    expect(result.success).toBe(true)
    expect(result.configPatch).toEqual({ autoShop: true })
    expect(setPluginConfig).toHaveBeenCalledWith(
      "room-1",
      "item-shops",
      expect.objectContaining({ enabled: true, autoShop: true }),
    )
    expect(syncAutoShopTimer).toHaveBeenCalled()
  })

  it("setAutoShopInterval preserves autoShop after enableAutoShop", async () => {
    plugin = new ItemShopsPlugin({ enabled: true, autoShop: false })
    vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
    const { context, setPluginConfig } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = { startSession: vi.fn(), clearSessionRound: vi.fn() }
    ;(plugin as any).configCache = {
      ...defaultItemShopsConfig,
      enabled: true,
      autoShop: false,
    }

    await plugin.executeAction("enableAutoShop", ADMIN)

    const result = await plugin.executeAction("setAutoShopInterval", ADMIN, {
      intervalMinutes: "15",
    })

    expect(result.success).toBe(true)
    expect(result.configPatch).toEqual({ autoShopIntervalMs: 15 * 60_000, autoShop: true })
    expect(setPluginConfig).toHaveBeenLastCalledWith(
      "room-1",
      "item-shops",
      expect.objectContaining({ autoShop: true, autoShopIntervalMs: 15 * 60_000 }),
    )
  })

  it("setAutoShopInterval clamps to at least one minute", async () => {
    vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
    const { context, setPluginConfig } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = { startSession: vi.fn(), clearSessionRound: vi.fn() }
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
      autoShop: true,
    })

    const result = await plugin.executeAction("setAutoShopInterval", ADMIN, {
      intervalMinutes: "1",
    })

    expect(result.success).toBe(true)
    expect(setPluginConfig).toHaveBeenCalledWith(
      "room-1",
      "item-shops",
      expect.objectContaining({ autoShopIntervalMs: 60_000 }),
    )
  })

  it("getConfigSchema includes section headings and quick access lists", () => {
    const schema = plugin.getConfigSchema()
    const layout = schema.layout
    const headingContents = layout
      .filter((item) => typeof item === "object" && item.type === "heading")
      .map((item) => (item as { content: string }).content)
    expect(headingContents).toEqual(
      expect.arrayContaining(["Auto-shop", "Physical Media", "Local Library"]),
    )
    expect(schema.quickAccessStatus).toEqual(["autoShop", "autoShopIntervalMs"])
    expect(schema.quickAccess).toContain("enableAutoShop")
    expect(schema.quickAccess).toContain("setAutoShopInterval")
    expect(schema.quickAccess).toContain("setOfferConditionRange")
    expect(schema.fieldMeta.offerConditionMin?.type).toBe("enum")
    expect(schema.fieldMeta.offerConditionMax?.type).toBe("enum")
  })

  it("setOfferConditionRange persists bounds via setPluginConfig", async () => {
    vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
    const { context, setPluginConfig } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = { startSession: vi.fn(), clearSessionRound: vi.fn() }
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
    })

    const result = await plugin.executeAction("setOfferConditionRange", ADMIN, {
      offerConditionMin: "good",
      offerConditionMax: "mint",
    })

    expect(result.success).toBe(true)
    expect(result.message).toBe("Record Store offers will be Mint, Good.")
    expect(result.configPatch).toEqual({
      offerConditionMin: "good",
      offerConditionMax: "mint",
    })
    expect(setPluginConfig).toHaveBeenCalledWith(
      "room-1",
      "item-shops",
      expect.objectContaining({ offerConditionMin: "good", offerConditionMax: "mint" }),
    )
    expect((plugin as any).offerConditionBounds).toEqual({ min: "good", max: "mint" })
  })

  it("setOfferConditionRange rejects invalid conditions", async () => {
    const { context } = createMockContext()
    ;(plugin as any).context = context
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue({
      ...defaultItemShopsConfig,
      enabled: true,
    })

    const result = await plugin.executeAction("setOfferConditionRange", ADMIN, {
      offerConditionMin: "pristine",
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe("Choose a worst and best condition.")
  })
})
