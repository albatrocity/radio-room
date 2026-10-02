import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { ShoppingSessionHelper } from "@repo/plugin-base"
import type { PluginActionInitiator } from "@repo/types"
import { ItemShopsPlugin } from "./index"
import { ITEM_CATALOG } from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { defaultItemShopsConfig } from "./types"

const ADMIN: PluginActionInitiator = { userId: "admin-1", username: "Admin" }
const AUTO_SHOP_INTERVAL_MS = 10 * 60_000

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

  const json = new Map<string, unknown>()
  const context = {
    roomId: "room-1",
    storage: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      del: vi.fn(async (key: string) => {
        json.delete(key)
      }),
      getJson: vi.fn(async (key: string) => ({ raw: null, value: json.get(key) ?? null })),
      setJson: vi.fn(async (key: string, value: unknown) => {
        json.set(key, value)
      }),
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
      emit: vi.fn(async () => {}),
      schedule: vi.fn(async () => ({ ok: true, fireAt: Date.now() + AUTO_SHOP_INTERVAL_MS })),
      cancelSchedule: vi.fn(async () => true),
      getSchedule: vi.fn(async () => null),
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

function autoShopConfig() {
  return {
    ...defaultItemShopsConfig,
    enabled: true,
    autoShop: true,
    autoShopIntervalMs: AUTO_SHOP_INTERVAL_MS,
  }
}

describe("ItemShopsPlugin auto-shop", () => {
  let plugin: ItemShopsPlugin

  beforeEach(() => {
    plugin = new ItemShopsPlugin({
      enabled: true,
      autoShop: true,
      autoShopIntervalMs: AUTO_SHOP_INTERVAL_MS,
    })
  })

  it("arms the auto-shop timer when enabled", async () => {
    const { context } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )

    await (plugin as any).syncAutoShopTimer()

    expect(context.api.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "auto-shop",
        durationMs: AUTO_SHOP_INTERVAL_MS,
      }),
    )
  })

  it("clears the auto-shop timer when auto-shop is off", async () => {
    plugin = new ItemShopsPlugin({ enabled: true, autoShop: false })
    const { context } = createMockContext()
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )

    await (plugin as any).syncAutoShopTimer()

    expect(context.api.cancelSchedule).toHaveBeenCalledWith("auto-shop")
    expect(context.api.schedule).not.toHaveBeenCalled()
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
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue(autoShopConfig())

    await (plugin as any).onAutoShopTick()

    expect(getActiveSession).toHaveBeenCalled()
    expect(openShoppingRound).not.toHaveBeenCalled()
    // The onScheduled handler re-calls syncAutoShopTimer; in unit test we only test onAutoShopTick.
    // syncAutoShopTimer is called within onAutoShopTick when session is null.
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
    vi.spyOn(plugin as any, "getConfig").mockResolvedValue(autoShopConfig())

    await (plugin as any).onAutoShopTick()

    expect(openShoppingRound).toHaveBeenCalled()
  })

  describe("shopAccess room shops (ADR 0201)", () => {
    function setup(config = autoShopConfig()) {
      const created = createMockContext()
      ;(plugin as any).context = created.context
      const shopping = {
        startSession: vi.fn(async () => {}),
        clearSessionRound: vi.fn(async () => {}),
        isActive: vi.fn(async () => true),
      }
      ;(plugin as any).shopping = shopping
      vi.spyOn(plugin as any, "getConfig").mockResolvedValue(config)
      vi.spyOn(plugin as any, "syncAutoShopTimer").mockResolvedValue(undefined)
      return { ...created, shopping, access: plugin.capabilities.shopAccess! }
    }

    it("opens a round limited to the named shops, even outside the rotation", async () => {
      const { access, shopping, context } = setup({ ...autoShopConfig(), enabledShopIds: ["sweetwater"] })
      const result = await access.openRoomShop({ scopeId: "trip:t1:site:a", shopIds: ["farmers-market"] })
      expect(result).toEqual({ ok: true })
      const [, eligible] = shopping.startSession.mock.calls[0] as unknown as [unknown, { shopId: string }[]]
      expect(eligible.map((s) => s.shopId)).toEqual(["farmers-market"])
      expect(context.api.emit).toHaveBeenCalledWith(
        "SHOPPING_SESSION_STARTED",
        { roomId: "room-1" },
        undefined,
      )
    })

    it("reports disabled, no session, and unknown shops", async () => {
      let { access } = setup({ ...autoShopConfig(), enabled: false })
      expect(await access.openRoomShop({ scopeId: "s", shopIds: ["farmers-market"] })).toEqual({
        ok: false,
        reason: "disabled",
      })
      ;({ access } = setup())
      expect(await access.openRoomShop({ scopeId: "s", shopIds: ["nope"] })).toEqual({
        ok: false,
        reason: "unknown-shop",
      })
      ;(plugin as any).context.game.getActiveSession = vi.fn(async () => null)
      expect(await access.openRoomShop({ scopeId: "s", shopIds: ["farmers-market"] })).toEqual({
        ok: false,
        reason: "no-session",
      })
    })

    it("closes only the round its scope opened", async () => {
      const { access, shopping } = setup()
      await access.openRoomShop({ scopeId: "trip:t1:site:a", shopIds: ["farmers-market"] })
      await access.closeRoomShop("trip:t1:site:other")
      expect(shopping.clearSessionRound).not.toHaveBeenCalled()
      await access.closeRoomShop("trip:t1:site:a")
      expect(shopping.clearSessionRound).toHaveBeenCalledTimes(1)
    })

    it("a regular round takes over the scope so the trip can't close it", async () => {
      const { access, shopping } = setup()
      await access.openRoomShop({ scopeId: "trip:t1:site:a", shopIds: ["farmers-market"] })
      await plugin.executeAction("startShoppingSession", ADMIN)
      await access.closeRoomShop("trip:t1:site:a")
      expect(shopping.clearSessionRound).not.toHaveBeenCalled()
    })

    it("auto-shop stands down while a scoped round is open", async () => {
      const { access } = setup()
      await access.openRoomShop({ scopeId: "trip:t1:site:a", shopIds: ["farmers-market"] })
      const openShoppingRound = vi.spyOn(plugin as any, "openShoppingRound")
      await (plugin as any).onAutoShopTick()
      expect(openShoppingRound).not.toHaveBeenCalled()
    })

    it("validates shop ids against the catalog", async () => {
      const { access } = setup()
      expect(await access.validateShop({ shopIds: ["farmers-market"] })).toEqual({ ok: true })
      expect(await access.validateShop({ shopIds: ["farmers-market", "mall"] })).toEqual({
        ok: false,
        errors: ['Unknown shop "mall"'],
      })
    })

    it("accepts Record Store everywhere, warning when the room can't open it", async () => {
      const { access } = setup()
      expect(await access.validateShop({ shopIds: ["record-store"] })).toEqual({
        ok: true,
        warnings: [
          "Record Store only opens in rooms on the Media Bridge with a local library; the van still stops",
        ],
      })
      expect(await access.openRoomShop({ scopeId: "s", shopIds: ["record-store"] })).toEqual({
        ok: false,
        reason: "unavailable",
      })
    })

    describe("custom offers (D14)", () => {
      const FLAT = {
        id: "road-trip:fix-a-flat",
        sourcePlugin: "road-trip",
        shortId: "fix-a-flat",
        name: "Fix-a-Flat",
        description: "Patch a blown tire.",
        stackable: true,
        maxStack: 5,
        tradeable: true,
        consumable: true,
        coinValue: 30,
      }

      function withDefinitions(definitions: (typeof FLAT)[]) {
        const created = setup()
        created.context.inventory.getItemDefinitions = vi.fn(async (ids: string[]) =>
          definitions.filter((d) => ids.includes(d.id)),
        )
        return created
      }

      it("opens an offers-only round on a synthetic shop with the resolved extras", async () => {
        const { access, shopping } = withDefinitions([FLAT])
        const result = await access.openRoomShop({
          scopeId: "trip:t1:site:gas",
          title: "Gas 'n' Go",
          offers: [{ definitionId: FLAT.id, basePrice: 25, stock: 2 }],
        })
        expect(result).toEqual({ ok: true })
        const [, eligible, extras] = shopping.startSession.mock.calls[0] as unknown as [
          unknown,
          { shopId: string; name: string }[],
          { definition: { id: string }; basePrice: number; stock?: number }[],
        ]
        expect(eligible).toEqual([
          expect.objectContaining({ shopId: "room-shop:trip:t1:site:gas", name: "Gas 'n' Go" }),
        ])
        expect(extras).toEqual([{ definition: FLAT, basePrice: 25, stock: 2 }])
      })

      it("adds offers to a catalog shop round and defaults the price to coinValue", async () => {
        const { access, shopping } = withDefinitions([FLAT])
        await access.openRoomShop({
          scopeId: "s",
          shopIds: ["farmers-market"],
          offers: [{ definitionId: FLAT.id }],
        })
        const [, eligible, extras] = shopping.startSession.mock.calls[0] as unknown as [
          unknown,
          { shopId: string }[],
          { basePrice: number }[],
        ]
        expect(eligible.map((s) => s.shopId)).toEqual(["farmers-market"])
        expect(extras[0]?.basePrice).toBe(30)
      })

      it("refuses unknown items on open and reports them on validate", async () => {
        const { access, shopping } = withDefinitions([FLAT])
        expect(
          await access.openRoomShop({ scopeId: "s", offers: [{ definitionId: "road-trip:jetpack" }] }),
        ).toEqual({ ok: false, reason: "unknown-item" })
        expect(shopping.startSession).not.toHaveBeenCalled()
        expect(
          await access.validateShop({
            offers: [{ definitionId: FLAT.id }, { definitionId: "road-trip:jetpack" }],
          }),
        ).toEqual({ ok: false, errors: ['Unknown item "road-trip:jetpack"'] })
        expect(await access.validateShop({ offers: [{ definitionId: FLAT.id }] })).toEqual({ ok: true })
        expect(await access.validateShop({})).toEqual({
          ok: false,
          errors: ["List at least one shop id or custom offer."],
        })
      })
    })
  })

  describe("manual start resets countdown", () => {
    it("delays the next auto tick when manual start reschedules", async () => {
      const openShoppingRound = vi
        .spyOn(plugin as any, "openShoppingRound")
        .mockResolvedValue({ success: true, message: "Shopping session started." })
      vi.spyOn(plugin as any, "getConfig").mockResolvedValue(autoShopConfig())
      const { context } = createMockContext()
      ;(plugin as any).context = context
      ;(plugin as any).shopping = { startSession: vi.fn(), clearSessionRound: vi.fn() }

      await (plugin as any).syncAutoShopTimer()
      expect(context.api.schedule).toHaveBeenCalledTimes(1)

      // Manual start triggers syncAutoShopTimer again
      const result = await plugin.executeAction("startShoppingSession", ADMIN)
      expect(result.success).toBe(true)
      expect(openShoppingRound).toHaveBeenCalledTimes(1)

      // syncAutoShopTimer is called again, re-scheduling with the same ID (replaces)
      expect(context.api.schedule).toHaveBeenCalledTimes(2)
    })
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
