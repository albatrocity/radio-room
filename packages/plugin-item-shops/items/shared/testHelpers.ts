import { expect, vi } from "vitest"
import type {
  GameSessionPluginAPI,
  ItemDefinition,
  PluginAPI,
  PluginContext,
  User,
} from "@repo/types"
import type { Item, ItemShopsBehaviorDeps } from "./types"

export function createMockPluginAPI(): PluginAPI {
  return {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserSystemMessage: vi.fn().mockResolvedValue(undefined),
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
  } as unknown as PluginAPI
}

export function createMockGame(): GameSessionPluginAPI {
  return {
    getActiveSession: vi.fn().mockResolvedValue(null),
    startSession: vi.fn(),
    endSession: vi.fn(),
    registerAttributes: vi.fn(),
    addScore: vi.fn(),
    setScore: vi.fn(),
    applyModifier: vi.fn(),
    applyTimedModifier: vi.fn().mockResolvedValue({ ok: true, modifierId: "mod-1" }),
    removeModifier: vi.fn(),
    getUserState: vi.fn().mockResolvedValue(null),
    getLeaderboard: vi.fn().mockResolvedValue([]),
  } as unknown as GameSessionPluginAPI
}

export function createMockDeps(overrides?: Partial<ItemShopsBehaviorDeps>): ItemShopsBehaviorDeps {
  return {
    pluginName: "item-shops",
    context: { roomId: "room-1", api: createMockPluginAPI() } as PluginContext,
    game: createMockGame(),
    effectDurationMs: 600_000,
    ...overrides,
  }
}

export function createMockDefinition(shortId: string, overrides?: Partial<ItemDefinition>): ItemDefinition {
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
    icon: "star",
    ...overrides,
  }
}

export function stubRoomUsers(deps: ItemShopsBehaviorDeps, users: User[]): void {
  vi.mocked(deps.context.api.getUsers).mockResolvedValue(users)
  vi.mocked(deps.context.api.getUsersByIds).mockImplementation(async (ids: string[]) =>
    users.filter((u) => ids.includes(u.userId)),
  )
}

export async function invokeUse(
  item: Item,
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
) {
  const handler = item.use
  if (!handler) {
    throw new Error(`Item ${item.shortId} has no use handler`)
  }
  return handler(deps, userId, definition, callContext)
}

/** Default pedal duration in tests — matches `createMockDeps().effectDurationMs`. */
const DEFAULT_EFFECT_MS = 600_000

export function expectApplyTimedModifierForPedal(
  deps: ItemShopsBehaviorDeps,
  actorUserId: string,
  options: {
    modifierName: string
    flag: string
    intent: "positive" | "negative"
  },
): void {
  expect(deps.game.applyTimedModifier).toHaveBeenCalledWith(
    actorUserId,
    DEFAULT_EFFECT_MS,
    expect.objectContaining({
      name: options.modifierName,
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
