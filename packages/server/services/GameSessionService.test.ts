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
      allowTrading: false,
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
