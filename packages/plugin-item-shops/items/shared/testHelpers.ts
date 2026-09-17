import { expect, vi } from "vitest"
import type {
  ArtifactsPluginAPI,
  GameSessionPluginAPI,
  GameStateEffectIntent,
  InventoryItem,
  ItemDefinition,
  PluginAPI,
  PluginContext,
  User,
} from "@repo/types"
import type { Item, ItemShopsBehaviorDeps, ItemShopsShopAccess } from "./types"

export function createMockPluginAPI(): PluginAPI {
  return {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    isUserInRoom: vi.fn().mockResolvedValue(false),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserToast: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn().mockResolvedValue([]),
    addToTrackQueue: vi.fn(),
    removeFromTrackQueue: vi.fn(),
    moveToTrackQueueTop: vi.fn(),
    moveToTrackQueueBottom: vi.fn(),
    moveTrackByPosition: vi.fn().mockResolvedValue({ success: true }),
    shuffleTrackQueue: vi.fn().mockResolvedValue({ success: true }),
    emit: vi.fn().mockResolvedValue(undefined),
    queueSoundEffect: vi.fn().mockResolvedValue(undefined),
    queueScreenEffect: vi.fn().mockResolvedValue(undefined),
    speakOnMediaBridge: vi.fn().mockResolvedValue({
      ok: false,
      message: "The line is dead — the DJ Mac isn’t linked.",
    }),
    listMediaBridgeSayVoices: vi.fn().mockResolvedValue({ voices: [] }),
  } as unknown as PluginAPI
}

export function createMockArtifacts(): ArtifactsPluginAPI {
  return {
    store: vi.fn().mockResolvedValue("artifact-id"),
    getAll: vi.fn().mockResolvedValue([]),
    getPublic: vi.fn().mockResolvedValue(null),
    attemptRetrieve: vi.fn().mockResolvedValue({ status: "not_found" }),
    attemptRetrieveWithGrant: vi.fn().mockResolvedValue({ status: "no_grant" }),
    grantAccess: vi.fn().mockResolvedValue(null),
    listAccessGrants: vi.fn().mockResolvedValue([]),
    revokeAccessGrant: vi.fn().mockResolvedValue(false),
    remove: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(null),
    withArtifactLock: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  } as ArtifactsPluginAPI
}

export function createMockGame(): GameSessionPluginAPI {
  return {
    getActiveSession: vi.fn().mockResolvedValue(null),
    startSession: vi.fn(),
    endSession: vi.fn(),
    registerAttributes: vi.fn(),
    addScore: vi.fn(),
    addScores: vi.fn(),
    setScore: vi.fn(),
    getEconomyScale: vi.fn().mockResolvedValue({
      costScale: 1,
      earnScale: 1,
      scaledAttributes: ["coin"],
      priceRounding: 1,
      updatedAt: 0,
    }),
    setEconomyScale: vi.fn().mockResolvedValue(null),
    getEconomySnapshot: vi.fn().mockResolvedValue(null),
    applyModifier: vi.fn(),
    applyTimedModifier: vi.fn().mockResolvedValue({ ok: true, modifierId: "mod-1" }),
    checkModifierDefense: vi.fn().mockResolvedValue({ ok: true }),
    reboundModifier: vi.fn().mockResolvedValue({ ok: true, modifierId: "mod-1" }),
    removeModifier: vi.fn(),
    getUserState: vi.fn().mockResolvedValue(null),
    getLeaderboard: vi.fn().mockResolvedValue([]),
    grantPresentedIdentity: vi.fn().mockResolvedValue(null),
    getPresentedIdentity: vi.fn().mockResolvedValue(null),
    clearPresentedIdentity: vi.fn().mockResolvedValue(false),
  } as unknown as GameSessionPluginAPI
}

/**
 * Map-backed `shopAccess` (ADR 0183) mirroring the plugin's per-shop state stores and
 * `shop:{shopId}:` timer prefix. Timers only record registration — callbacks never fire.
 */
export function createMockShopAccess(): ItemShopsShopAccess & {
  seedState: (shopId: string, key: string, value: unknown) => void
  seedTimer: (shopId: string, id: string) => void
} {
  const stores = new Map<string, Map<string, unknown>>()
  const timers = new Set<string>()
  const storeFor = (shopId: string): Map<string, unknown> => {
    let store = stores.get(shopId)
    if (!store) {
      store = new Map()
      stores.set(shopId, store)
    }
    return store
  }
  const timerKey = (shopId: string, id: string): string => `shop:${shopId}:${id}`

  return {
    getState: <T>(shopId: string, key: string) => storeFor(shopId).get(key) as T | undefined,
    setState: vi.fn(<T>(shopId: string, key: string, value: T) => {
      storeFor(shopId).set(key, value)
    }),
    deleteState: vi.fn((shopId: string, key: string) => {
      storeFor(shopId).delete(key)
    }),
    getTimer: (shopId: string, id: string) => {
      const key = timerKey(shopId, id)
      return timers.has(key) ? { id: key } : null
    },
    clearTimer: vi.fn((shopId: string, id: string) => timers.delete(timerKey(shopId, id))),
    seedState: (shopId, key, value) => {
      storeFor(shopId).set(key, value)
    },
    seedTimer: (shopId, id) => {
      timers.add(timerKey(shopId, id))
    },
  }
}

export function createMockDeps(overrides?: Partial<ItemShopsBehaviorDeps>): ItemShopsBehaviorDeps {
  const getItemDefinition = vi.fn().mockResolvedValue(null)
  const getItemDefinitions = vi.fn(async (ids: readonly string[]) => {
    const out: ItemDefinition[] = []
    for (const id of ids) {
      const def = await getItemDefinition(id)
      if (def) out.push(def)
    }
    return out
  })
  return {
    pluginName: "item-shops",
    context: {
      roomId: "room-1",
      api: createMockPluginAPI(),
      artifacts: createMockArtifacts(),
      getRoom: vi.fn().mockResolvedValue(null),
      inventory: {
        getInventory: vi
          .fn()
          .mockResolvedValue({ userId: "", items: [], maxSlots: 20, maxCollectionSlots: 20, maxPlaybackSlots: 20 }),
        getItemDefinition,
        getItemDefinitions,
        getAllItemDefinitions: vi.fn().mockResolvedValue([]),
        removeItem: vi.fn().mockResolvedValue(true),
        giveItem: vi.fn().mockResolvedValue(null),
        updateItemMetadata: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PluginContext,
    game: createMockGame(),
    shopAccess: createMockShopAccess(),
    ...overrides,
  }
}

export function createMockDefinition(
  shortId: string,
  overrides?: Partial<ItemDefinition>,
): ItemDefinition {
  return {
    id: `def-${shortId}`,
    shortId,
    sourcePlugin: "item-shops",
    name: shortId,
    description: "Test item",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 50,
    icon: "Star",
    ...overrides,
  }
}

export function stubRoomUsers(deps: ItemShopsBehaviorDeps, users: User[]): void {
  vi.mocked(deps.context.api.getUsers).mockResolvedValue(users)
  vi.mocked(deps.context.api.getUsersByIds).mockImplementation(async (ids: string[]) =>
    users.filter((u) => ids.includes(u.userId)),
  )
  vi.mocked(deps.context.api.isUserInRoom).mockImplementation(async (_roomId, userId) =>
    users.some((u) => u.userId === userId),
  )
}

export function createMockInventoryStack(
  definition: ItemDefinition,
  overrides?: Partial<InventoryItem>,
): InventoryItem {
  return {
    itemId: "mock-item-1",
    definitionId: definition.id,
    sourcePlugin: definition.sourcePlugin,
    quantity: 1,
    acquiredAt: Date.now(),
    ...overrides,
  }
}

export async function invokeUse(
  item: Item,
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
  activeStack?: Partial<InventoryItem>,
) {
  const handler = item.use
  if (!handler) {
    throw new Error(`Item ${item.shortId} has no use handler`)
  }
  const mergedDeps: ItemShopsBehaviorDeps =
    activeStack !== undefined
      ? { ...deps, activeInventoryItem: createMockInventoryStack(definition, activeStack) }
      : deps
  return handler(mergedDeps, userId, definition, callContext)
}

export function expectApplyTimedModifierForPedal(
  deps: ItemShopsBehaviorDeps,
  actorUserId: string,
  options: {
    modifierName: string
    flag: string
    intent: GameStateEffectIntent
    durationMs: number
    visibility?: "public" | "self"
  },
): void {
  expect(deps.game.applyTimedModifier).toHaveBeenCalledWith(
    actorUserId,
    options.durationMs,
    expect.objectContaining({
      name: options.modifierName,
      ...(options.visibility ? { visibility: options.visibility } : {}),
      effects: [
        expect.objectContaining({
          type: "flag",
          name: options.flag,
          value: true,
          intent: options.intent,
        }),
      ],
    }),
    actorUserId,
  )
}
