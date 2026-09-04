import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, GameStateModifier, UserGameState } from "@repo/types"
import { MemoryRedisClient } from "../test-utils/MemoryRedisClient"
import { GameSessionService } from "./GameSessionService"

const roomId = "room1"
const userId = "u1"
const sessionId = "session1"
const activeKey = `room:${roomId}:game:active`
const sessionBlobKey = `room:${roomId}:game:session:${sessionId}`
const userStateKey = `${sessionBlobKey}:user:${userId}:state`

function makeSession(): GameSession {
  return {
    id: sessionId,
    roomId,
    config: {
      enabledAttributes: ["score"],
      initialValues: { score: 0 },
      maxInventorySlots: 3,
      maxCollectionSlots: 12,
      maxPlaybackSlots: 2,
      allowTrading: false,
      leaderboards: [],
    },
  } as unknown as GameSession
}

function incomingModifier(
  overrides: Partial<GameStateModifier> = {},
): Omit<GameStateModifier, "id" | "source"> {
  const now = Date.now()
  return {
    name: "x-ray",
    stackBehavior: "stack",
    startAt: now,
    endAt: now + 60_000,
    effects: [{ type: "flag", name: "inventory_peek", value: true }],
    ...overrides,
  } as Omit<GameStateModifier, "id" | "source">
}

/**
 * `context.inventory` is intentionally absent: `DefenseService` short-circuits
 * without it, so the passive-defense path runs to completion (clear) without
 * inventory reads. Redis reads left in the trace are session resolution only.
 */
function makeCtx() {
  const redis = new MemoryRedisClient()
  const context = { redis: { pubClient: redis } } as unknown as AppContext
  return { redis, context, service: new GameSessionService(context) }
}

async function seedSession(redis: MemoryRedisClient) {
  await redis.set(activeKey, sessionId)
  await redis.set(sessionBlobKey, JSON.stringify(makeSession()))
}

function sessionReads(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.filter(([key]) => key === activeKey || key === sessionBlobKey)
}

describe("GameSessionService.applyModifier", () => {
  beforeEach(() => vi.clearAllMocks())

  test("resolves the active session once for the defense check and the state read", async () => {
    const { redis, service } = makeCtx()
    await seedSession(redis)
    const get = vi.spyOn(redis, "get")

    const result = await service.applyModifier(roomId, userId, "item-shops", incomingModifier())

    expect(result).toEqual({ ok: true, modifierId: expect.any(String) })
    // Two `GET`s (active pointer + session blob), not four: `checkModifierDefense`
    // and `getUserState` reuse the session this apply already resolved.
    expect(sessionReads(get)).toHaveLength(2)

    const stored = JSON.parse((await redis.get(userStateKey))!) as UserGameState
    expect(stored.modifiers).toHaveLength(1)
    expect(stored.modifiers[0]!.name).toBe("x-ray")
  })

  test("resolves the active session once when the defense check is skipped", async () => {
    const { redis, service } = makeCtx()
    await seedSession(redis)
    const get = vi.spyOn(redis, "get")

    const result = await service.applyModifier(roomId, userId, "item-shops", incomingModifier(), {
      skipPassiveDefenseCheck: true,
    })

    expect(result.ok).toBe(true)
    expect(sessionReads(get)).toHaveLength(2)
  })

  test("extending an existing modifier still resolves the session once", async () => {
    const { redis, service } = makeCtx()
    await seedSession(redis)
    const now = Date.now()
    await redis.set(
      userStateKey,
      JSON.stringify({
        userId,
        attributes: { score: 0 },
        modifiers: [
          {
            id: "m1",
            name: "x-ray",
            source: "item-shops",
            stackBehavior: "extend",
            startAt: now - 1000,
            endAt: now + 30_000,
            effects: [],
          },
        ],
      } satisfies UserGameState),
    )
    const get = vi.spyOn(redis, "get")

    const result = await service.applyModifier(
      roomId,
      userId,
      "item-shops",
      incomingModifier({ stackBehavior: "extend", endAt: now + 90_000 }),
    )

    expect(result).toEqual({ ok: true, modifierId: "m1" })
    // The `persistModifiers` re-read of user state reuses the same session too.
    expect(sessionReads(get)).toHaveLength(2)

    const stored = JSON.parse((await redis.get(userStateKey))!) as UserGameState
    expect(stored.modifiers[0]!.endAt).toBe(now + 90_000)
  })

  test("reports no_active_session when the room has no session", async () => {
    const { redis, service } = makeCtx()

    const result = await service.applyModifier(roomId, userId, "item-shops", incomingModifier())

    expect(result).toEqual({ ok: false, reason: "no_active_session" })
    expect(await redis.get(userStateKey)).toBeNull()
  })
})

describe("GameSessionService.getUserState", () => {
  test("skips session resolution when handed the active session", async () => {
    const { redis, service } = makeCtx()
    await seedSession(redis)
    const get = vi.spyOn(redis, "get")

    const state = await service.getUserState(roomId, userId, makeSession())

    expect(state.userId).toBe(userId)
    expect(sessionReads(get)).toHaveLength(0)
    expect(get).toHaveBeenCalledExactlyOnceWith(userStateKey)
  })

  test("resolves the session itself when none is passed", async () => {
    const { redis, service } = makeCtx()
    await seedSession(redis)
    const get = vi.spyOn(redis, "get")

    await service.getUserState(roomId, userId)

    expect(sessionReads(get)).toHaveLength(2)
  })
})

describe("GameSessionService.addScores", () => {
  test("persists once and emits one GAME_STATE_CHANGED for coin and score", async () => {
    const { redis, context, service } = makeCtx()
    const emit = vi.fn()
    ;(context as { systemEvents: { emit: typeof emit } }).systemEvents = { emit }
    await seedSession(redis)

    const values = await service.addScores(
      roomId,
      userId,
      [
        { attribute: "coin", amount: 3 },
        { attribute: "score", amount: 3 },
      ],
      "queue-theme",
    )

    expect(values).toEqual([3, 3])
    const stored = JSON.parse((await redis.get(userStateKey))!) as UserGameState
    expect(stored.attributes.coin).toBe(3)
    expect(stored.attributes.score).toBe(3)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "GAME_STATE_CHANGED",
      expect.objectContaining({
        userId,
        changes: [
          { attribute: "coin", previousValue: 0, value: 3, reason: "queue-theme" },
          { attribute: "score", previousValue: 0, value: 3, reason: "queue-theme" },
        ],
      }),
    )
  })

  test("addScore emits a single change via addScores", async () => {
    const { redis, context, service } = makeCtx()
    const emit = vi.fn()
    ;(context as { systemEvents: { emit: typeof emit } }).systemEvents = { emit }
    await seedSession(redis)

    await expect(service.addScore(roomId, userId, "score", 2, "test")).resolves.toBe(2)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "GAME_STATE_CHANGED",
      expect.objectContaining({
        changes: [{ attribute: "score", previousValue: 0, value: 2, reason: "test" }],
      }),
    )
  })
})

describe("GameSessionService economy scale", () => {
  function makeEconomySession(earnScale = 1, costScale = 1): GameSession {
    return {
      id: sessionId,
      roomId,
      status: "active",
      startedAt: 1,
      config: {
        id: sessionId,
        name: "t",
        enabledAttributes: ["score", "coin"],
        initialValues: {},
        maxInventorySlots: 3,
        maxCollectionSlots: 12,
        maxPlaybackSlots: 2,
        allowTrading: false,
        allowSelling: false,
        physicalMediaWearForAdmins: true,
        inventoryEnabled: true,
        mode: "individual",
        leaderboards: [],
        economy: {
          costScale,
          earnScale,
          scaledAttributes: ["coin"],
          priceRounding: 1,
          updatedAt: 1,
        },
      },
    }
  }

  async function seedEconomy(redis: MemoryRedisClient, earnScale = 2) {
    await redis.set(activeKey, sessionId)
    await redis.set(sessionBlobKey, JSON.stringify(makeEconomySession(earnScale)))
  }

  test("applies earnScale to positive coin deltas", async () => {
    const { redis, context, service } = makeCtx()
    ;(context as { systemEvents: { emit: ReturnType<typeof vi.fn> } }).systemEvents = { emit: vi.fn() }
    await seedEconomy(redis, 2)

    const [value] = await service.addScores(roomId, userId, [{ attribute: "coin", amount: 10 }], "loyalty")
    expect(value).toBe(20)
  })

  test("intent exact bypasses earnScale", async () => {
    const { redis, context, service } = makeCtx()
    ;(context as { systemEvents: { emit: ReturnType<typeof vi.fn> } }).systemEvents = { emit: vi.fn() }
    await seedEconomy(redis, 2)

    const [value] = await service.addScores(
      roomId,
      userId,
      [{ attribute: "coin", amount: 10 }],
      "refund",
      { intent: "exact" },
    )
    expect(value).toBe(10)
  })

  test("score is unaffected by default scaledAttributes", async () => {
    const { redis, context, service } = makeCtx()
    ;(context as { systemEvents: { emit: ReturnType<typeof vi.fn> } }).systemEvents = { emit: vi.fn() }
    await seedEconomy(redis, 2)

    const [value] = await service.addScores(roomId, userId, [{ attribute: "score", amount: 10 }], "quiz")
    expect(value).toBe(10)
  })

  test("applies earnScale before modifiers", async () => {
    const { redis, context, service } = makeCtx()
    ;(context as { systemEvents: { emit: ReturnType<typeof vi.fn> } }).systemEvents = { emit: vi.fn() }
    await seedEconomy(redis, 2)
    const now = Date.now()
    await redis.set(
      userStateKey,
      JSON.stringify({
        userId,
        attributes: { coin: 0 },
        modifiers: [
          {
            id: "m1",
            name: "double",
            source: "test",
            stackBehavior: "replace",
            startAt: now - 1000,
            endAt: now + 60_000,
            effects: [
              { type: "multiplier", target: "coin", value: 2 },
              { type: "additive", target: "coin", value: 5 },
            ],
          },
        ],
      } satisfies UserGameState),
    )

    // scale first: 10 * 2 = 20, then 20 * 2 + 5 = 45. Modifier-first would be (10*2+5)*2 = 50.
    const [value] = await service.addScores(roomId, userId, [{ attribute: "coin", amount: 10 }], "buff")
    expect(value).toBe(45)
  })

  test("setEconomyScale clamps and emits GAME_ECONOMY_SCALE_CHANGED", async () => {
    const { redis, context, service } = makeCtx()
    const emit = vi.fn()
    ;(context as { systemEvents: { emit: typeof emit } }).systemEvents = { emit }
    await seedEconomy(redis, 1)

    const session = await service.setEconomyScale(
      roomId,
      { costScale: 99, earnScale: 0 },
      { updatedBy: "admin", reason: "test" },
    )
    expect(session?.config.economy?.costScale).toBe(8)
    expect(session?.config.economy?.earnScale).toBe(0.25)
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "GAME_ECONOMY_SCALE_CHANGED",
      expect.objectContaining({
        costScale: 8,
        earnScale: 0.25,
        previous: { costScale: 1, earnScale: 1 },
        updatedBy: "admin",
        reason: "test",
      }),
    )
  })
})
