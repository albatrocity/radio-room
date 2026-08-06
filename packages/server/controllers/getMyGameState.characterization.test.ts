/**
 * Characterization tests for GET_MY_GAME_STATE per-user plugin fields.
 * Asserts semantic content via shape-agnostic accessors so the wire format
 * can migrate from top-level fields to `pluginUserState` without rewriting
 * expectation logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRoomsController } from "./roomsController"
import { resolveItemRarity } from "@repo/game-logic"
import {
  ITEM_SHOPS_PLUGIN_NAME,
  ITEM_SHOPS_SESSION_STORAGE_KEYS,
  PLAYLIST_BINGO_PLUGIN_NAME,
  PLAYLIST_BINGO_STORAGE_KEYS,
  type BingoCard,
  type GameSession,
  type ItemDefinition,
  type ShoppingSessionInstance,
  type UserGameState,
  type UserInventory,
} from "@repo/types"
import { PluginStorageImpl } from "../lib/plugins/PluginStorage"
import { readBingoCard, readShopInstance, type GameStatePayloadLike } from "./getMyGameState.testAccessors"

function pluginStorageKey(roomId: string, pluginName: string, key: string): string {
  return `room:${roomId}:plugins:${pluginName}:storage:${key}`
}

function createInMemoryRedisPubClient() {
  const kv = new Map<string, string>()
  const hashes = new Map<string, Map<string, string>>()

  return {
    kv,
    hashes,
    get: vi.fn(async (key: string) => kv.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      kv.set(key, value)
    }),
    hGet: vi.fn(async (key: string, field: string) => hashes.get(key)?.get(field) ?? null),
    hSet: vi.fn(async (key: string, field: string, value: string) => {
      let h = hashes.get(key)
      if (!h) {
        h = new Map()
        hashes.set(key, h)
      }
      h.set(field, value)
    }),
    hGetAll: vi.fn(async (key: string) => {
      const h = hashes.get(key)
      if (!h) return {}
      return Object.fromEntries(h)
    }),
  }
}

const ROOM_ID = "room-char"
const USER_ID = "user-1"
const OTHER_USER_ID = "user-2"

const session = {
  id: "session-1",
  roomId: ROOM_ID,
  startedAt: 1_000,
  status: "active",
  config: {
    id: "cfg-1",
    name: "Test",
    enabledAttributes: ["score", "coin"],
    initialValues: {},
    leaderboards: [],
    mode: "freeplay",
    inventoryEnabled: true,
    maxInventorySlots: 10,
    allowTrading: false,
    allowSelling: true,
  },
} as unknown as GameSession

const userState = {
  userId: USER_ID,
  attributes: { score: 0, coin: 50 },
  modifiers: [],
} as unknown as UserGameState

const inventory: UserInventory = {
  userId: USER_ID,
  items: [
    {
      itemId: "stack-1",
      definitionId: "item-shops:cold-beer",
      quantity: 1,
      acquiredAt: 1_000,
      sourcePlugin: ITEM_SHOPS_PLUGIN_NAME,
    },
  ],
  maxSlots: 10,
}

const beerDef = {
  id: "item-shops:cold-beer",
  shortId: "cold-beer",
  name: "Cold Beer",
  description: "A cold one",
  icon: "Beer",
  sourcePlugin: ITEM_SHOPS_PLUGIN_NAME,
  rarity: "uncommon",
  stackable: true,
  maxStack: 99,
  consumable: true,
  tradeable: true,
} as unknown as ItemDefinition

function makeShopInstance(
  overrides: Partial<ShoppingSessionInstance> = {},
): ShoppingSessionInstance {
  return {
    shopId: "shop-a",
    shopName: "Corner Shop",
    offers: [
      {
        offerId: 0,
        shortId: "cold-beer",
        name: "Cold Beer",
        description: "A cold one",
        icon: "Beer",
        price: 10,
        available: true,
        rarity: "common",
      },
    ],
    openedAt: 2_000,
    ...overrides,
  }
}

function makeBingoCard(userId: string): BingoCard {
  return {
    userId,
    status: "playing",
    cells: [
      {
        r: 0,
        c: 0,
        criterionId: "c0",
        label: "Title contains 'spirit'",
        marked: false,
        criterion: { id: "c0", type: "titleContains", value: "spirit" },
      },
    ],
  }
}

describe("GET_MY_GAME_STATE characterization", () => {
  let redis: ReturnType<typeof createInMemoryRedisPubClient>
  let handlers: Map<string, (...args: unknown[]) => Promise<void>>
  let emit: ReturnType<typeof vi.fn>
  let gameSessions: {
    getActiveSession: ReturnType<typeof vi.fn>
    getUserState: ReturnType<typeof vi.fn>
  }
  let inventoryService: {
    getInventory: ReturnType<typeof vi.fn>
    getAllItemDefinitions: ReturnType<typeof vi.fn>
  }
  let invokeGetSellbackValues: ReturnType<typeof vi.fn>
  let invokeContributeToUserGameState: ReturnType<typeof vi.fn> | undefined

  beforeEach(() => {
    redis = createInMemoryRedisPubClient()
    handlers = new Map()
    emit = vi.fn()
    gameSessions = {
      getActiveSession: vi.fn(async () => session),
      getUserState: vi.fn(async () => userState),
    }
    inventoryService = {
      getInventory: vi.fn(async () => inventory),
      getAllItemDefinitions: vi.fn(async () => [beerDef]),
    }
    invokeGetSellbackValues = vi.fn(async () => ({}))
    invokeContributeToUserGameState = undefined
  })

  function seedShop(active: boolean, instanceByUser: Record<string, string | undefined>) {
    const activeKey = pluginStorageKey(
      ROOM_ID,
      ITEM_SHOPS_PLUGIN_NAME,
      ITEM_SHOPS_SESSION_STORAGE_KEYS.ACTIVE,
    )
    redis.kv.set(activeKey, active ? "true" : "false")
    const hashKey = pluginStorageKey(
      ROOM_ID,
      ITEM_SHOPS_PLUGIN_NAME,
      ITEM_SHOPS_SESSION_STORAGE_KEYS.INSTANCES,
    )
    const h = new Map<string, string>()
    for (const [uid, raw] of Object.entries(instanceByUser)) {
      if (raw != null) h.set(uid, raw)
    }
    redis.hashes.set(hashKey, h)
  }

  function seedBingo(roundRaw: string | null, cardByUser: Record<string, string | undefined>) {
    const roundKey = pluginStorageKey(
      ROOM_ID,
      PLAYLIST_BINGO_PLUGIN_NAME,
      PLAYLIST_BINGO_STORAGE_KEYS.ROUND,
    )
    if (roundRaw != null) redis.kv.set(roundKey, roundRaw)
    const hashKey = pluginStorageKey(
      ROOM_ID,
      PLAYLIST_BINGO_PLUGIN_NAME,
      PLAYLIST_BINGO_STORAGE_KEYS.CARDS,
    )
    const h = new Map<string, string>()
    for (const [uid, raw] of Object.entries(cardByUser)) {
      if (raw != null) h.set(uid, raw)
    }
    redis.hashes.set(hashKey, h)
  }

  /**
   * Simulate plugin contributeToUserGameState by reading the same Redis keys
   * plugins own (keeps Redis-seeded golden fixtures valid after the controller
   * stopped hardcoding plugin names).
   */
  async function contributeFromRedis(
    roomId: string,
    userId: string,
    ctx: { itemDefinitions: ItemDefinition[] },
  ): Promise<Record<string, Record<string, unknown>>> {
    const appContext = {
      redis: { pubClient: redis, client: redis, sub: {}, pub: {} },
    } as any

    const shopStorage = new PluginStorageImpl(appContext, ITEM_SHOPS_PLUGIN_NAME, roomId)
    const active = (await shopStorage.get(ITEM_SHOPS_SESSION_STORAGE_KEYS.ACTIVE)) === "true"
    let currentShopInstance: ShoppingSessionInstance | null = null
    if (active) {
      const raw = await shopStorage.hget(ITEM_SHOPS_SESSION_STORAGE_KEYS.INSTANCES, userId)
      if (raw) {
        try {
          currentShopInstance = JSON.parse(raw) as ShoppingSessionInstance
        } catch {
          currentShopInstance = null
        }
      }
    }
    if (currentShopInstance) {
      const byShortId = new Map<string, ItemDefinition>()
      for (const def of ctx.itemDefinitions) {
        if (def.sourcePlugin === ITEM_SHOPS_PLUGIN_NAME) {
          byShortId.set(def.shortId, def)
        }
      }
      currentShopInstance = {
        ...currentShopInstance,
        offers: currentShopInstance.offers.map((offer) => ({
          ...offer,
          rarity: offer.rarity ?? resolveItemRarity(byShortId.get(offer.shortId) ?? {}),
        })),
      }
    }

    const bingoStorage = new PluginStorageImpl(appContext, PLAYLIST_BINGO_PLUGIN_NAME, roomId)
    const roundRaw = await bingoStorage.get(PLAYLIST_BINGO_STORAGE_KEYS.ROUND)
    let card: BingoCard | null = null
    let roundActive = false
    if (roundRaw) {
      try {
        roundActive = (JSON.parse(roundRaw) as { active?: boolean }).active === true
      } catch {
        roundActive = false
      }
    }
    if (roundActive) {
      const cardRaw = await bingoStorage.hget(PLAYLIST_BINGO_STORAGE_KEYS.CARDS, userId)
      if (cardRaw) {
        try {
          card = JSON.parse(cardRaw) as BingoCard
        } catch {
          card = null
        }
      }
    }

    return {
      [ITEM_SHOPS_PLUGIN_NAME]: { currentShopInstance },
      [PLAYLIST_BINGO_PLUGIN_NAME]: { card },
    }
  }

  function mountController(opts?: { noGameSessions?: boolean; noInventory?: boolean }) {
    const contribute =
      invokeContributeToUserGameState ??
      vi.fn(async (roomId: string, userId: string, ctx: { itemDefinitions: ItemDefinition[] }) =>
        contributeFromRedis(roomId, userId, ctx),
      )

    const socket = {
      data: { roomId: ROOM_ID, userId: USER_ID },
      emit,
      on: vi.fn((event: string, handler: (...args: unknown[]) => Promise<void>) => {
        handlers.set(event, handler)
      }),
      context: {
        redis: {
          pubClient: redis,
          client: redis,
          sub: {},
          pub: {},
        },
        gameSessions: opts?.noGameSessions ? undefined : gameSessions,
        inventory: opts?.noInventory ? undefined : inventoryService,
        pluginRegistry: {
          invokeGetSellbackValues,
          invokeContributeToUserGameState: contribute,
        },
      },
    }
    const io = { to: vi.fn(() => ({ emit: vi.fn() })) }
    createRoomsController(socket as any, io as any)
    const handler = handlers.get("GET_MY_GAME_STATE")
    if (!handler) throw new Error("GET_MY_GAME_STATE not registered")
    return handler
  }

  function lastPayload(): GameStatePayloadLike {
    expect(emit).toHaveBeenCalled()
    const call = emit.mock.calls[emit.mock.calls.length - 1]
    // socket.emit("event", { type, data })
    expect(call[0]).toBe("event")
    const envelope = call[1] as { type: string; data: GameStatePayloadLike }
    expect(envelope.type).toBe("USER_GAME_STATE")
    return envelope.data
  }

  async function invoke(): Promise<GameStatePayloadLike> {
    const handler = mountController()
    await handler()
    return lastPayload()
  }

  it("returns null payload when gameSessions is missing", async () => {
    const handler = mountController({ noGameSessions: true })
    await handler()
    const data = lastPayload()
    expect(data.session).toBeNull()
    expect(readShopInstance(data)).toBeNull()
    expect(readBingoCard(data)).toBeNull()
  })

  it("returns null payload when no active session", async () => {
    gameSessions.getActiveSession.mockResolvedValueOnce(null)
    const data = await invoke()
    expect(data.session).toBeNull()
    expect(readShopInstance(data)).toBeNull()
    expect(readBingoCard(data)).toBeNull()
  })

  it("returns null shop when shopping session inactive", async () => {
    seedShop(false, { [USER_ID]: JSON.stringify(makeShopInstance()) })
    const data = await invoke()
    expect(readShopInstance(data)).toBeNull()
  })

  it("returns null shop when active but no instance for this user", async () => {
    seedShop(true, {
      [OTHER_USER_ID]: JSON.stringify(makeShopInstance({ shopName: "Other Shop" })),
    })
    const data = await invoke()
    expect(readShopInstance(data)).toBeNull()
  })

  it("returns shop instance for this user and never another user's", async () => {
    const mine = makeShopInstance({ shopName: "Mine" })
    const theirs = makeShopInstance({ shopName: "Theirs" })
    seedShop(true, {
      [USER_ID]: JSON.stringify(mine),
      [OTHER_USER_ID]: JSON.stringify(theirs),
    })
    const data = await invoke()
    const shop = readShopInstance(data)
    expect(shop?.shopName).toBe("Mine")
    expect(shop?.shopName).not.toBe("Theirs")
  })

  it("hydrates missing offer rarity from item definitions", async () => {
    const instance = makeShopInstance({
      offers: [
        {
          offerId: 0,
          shortId: "cold-beer",
          name: "Cold Beer",
          description: "A cold one",
          icon: "Beer",
          price: 10,
          available: true,
          // rarity deliberately omitted (legacy persisted shape)
          rarity: undefined as unknown as "common",
        },
      ],
    })
    seedShop(true, { [USER_ID]: JSON.stringify(instance) })
    const data = await invoke()
    const shop = readShopInstance(data)
    expect(shop?.offers[0]?.rarity).toBe("uncommon")
  })

  it("preserves existing offer rarity", async () => {
    const instance = makeShopInstance({
      offers: [
        {
          offerId: 0,
          shortId: "cold-beer",
          name: "Cold Beer",
          description: "A cold one",
          icon: "Beer",
          price: 10,
          available: true,
          rarity: "legendary",
        },
      ],
    })
    seedShop(true, { [USER_ID]: JSON.stringify(instance) })
    const data = await invoke()
    expect(readShopInstance(data)?.offers[0]?.rarity).toBe("legendary")
  })

  it("returns null shop on malformed instance JSON", async () => {
    seedShop(true, { [USER_ID]: "{not-json" })
    const data = await invoke()
    expect(readShopInstance(data)).toBeNull()
  })

  it("returns null bingo when no round", async () => {
    seedBingo(null, {})
    const data = await invoke()
    expect(readBingoCard(data)).toBeNull()
  })

  it("returns null bingo when round inactive", async () => {
    seedBingo(JSON.stringify({ active: false }), {
      [USER_ID]: JSON.stringify(makeBingoCard(USER_ID)),
    })
    const data = await invoke()
    expect(readBingoCard(data)).toBeNull()
  })

  it("returns bingo card for this user when round active", async () => {
    const card = makeBingoCard(USER_ID)
    seedBingo(JSON.stringify({ active: true }), {
      [USER_ID]: JSON.stringify(card),
      [OTHER_USER_ID]: JSON.stringify(makeBingoCard(OTHER_USER_ID)),
    })
    const data = await invoke()
    const got = readBingoCard(data)
    expect(got?.userId).toBe(USER_ID)
    expect(got?.cells[0]?.label).toBe("Title contains 'spirit'")
    expect(got?.userId).not.toBe(OTHER_USER_ID)
  })

  it("returns null bingo when round active but no card for this user", async () => {
    seedBingo(JSON.stringify({ active: true }), {
      [OTHER_USER_ID]: JSON.stringify(makeBingoCard(OTHER_USER_ID)),
    })
    const data = await invoke()
    expect(readBingoCard(data)).toBeNull()
  })

  it("returns null bingo on malformed card JSON", async () => {
    seedBingo(JSON.stringify({ active: true }), { [USER_ID]: "{bad" })
    const data = await invoke()
    expect(readBingoCard(data)).toBeNull()
  })

  it("merges sellback values onto inventory items", async () => {
    invokeGetSellbackValues.mockResolvedValueOnce({ "stack-1": 7 })
    const data = await invoke()
    const inv = data.inventory as UserInventory
    expect(inv.items[0]?.sellbackValue).toBe(7)
  })

  it("golden: active shop + active bingo for requesting user", async () => {
    const shop = makeShopInstance({ shopName: "Golden Shop", listedBuybackRate: 0.5 })
    const card = makeBingoCard(USER_ID)
    seedShop(true, { [USER_ID]: JSON.stringify(shop) })
    seedBingo(JSON.stringify({ active: true, category: "mixed" }), {
      [USER_ID]: JSON.stringify(card),
    })
    const data = await invoke()

    const fixture = {
      shopName: readShopInstance(data)?.shopName,
      offerRarity: readShopInstance(data)?.offers[0]?.rarity,
      bingoUserId: readBingoCard(data)?.userId,
      bingoLabel: readBingoCard(data)?.cells[0]?.label,
      bingoStatus: readBingoCard(data)?.status,
      sessionId: (data.session as GameSession | null)?.id ?? null,
      coin: (data.state as UserGameState | null)?.attributes?.coin ?? null,
    }

    expect(fixture).toEqual({
      shopName: "Golden Shop",
      offerRarity: "common",
      bingoUserId: USER_ID,
      bingoLabel: "Title contains 'spirit'",
      bingoStatus: "playing",
      sessionId: "session-1",
      coin: 50,
    })
  })
})
