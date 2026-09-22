import { describe, it, expect, beforeEach, vi } from "vitest"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  scheduleModifierExpiry,
  claimDueModifierExpiries,
  cancelModifierExpiry,
  GAME_MODIFIERS_EXPIRING_KEY,
  modifierExpiryMember,
} from "../data/gameModifiers"
import { sweepExpiredModifiers } from "../game/sweepExpiredModifiers"
import type { AppContext, GameSession, UserGameState } from "@repo/types"

const roomId = "room1"
const sessionId = "session1"
const userId = "u1"
const modifierId = "mod1"

function makeContext(
  redis: MemoryRedisClient,
  gameSessions?: unknown,
  systemEvents?: { emit: ReturnType<typeof vi.fn> },
): AppContext {
  return {
    redis: { pubClient: redis as never, subClient: redis as never },
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
      serviceAuth: new Map(),
      playbackControllerModules: new Map(),
      metadataSourceModules: new Map(),
      mediaSourceModules: new Map(),
    },
    jobs: [],
    gameSessions,
    systemEvents,
  } as unknown as AppContext
}

describe("modifier expiry (ADR 0191)", () => {
  let redis: MemoryRedisClient

  beforeEach(() => {
    redis = new MemoryRedisClient()
  })

  it("claims each due modifier only once across concurrent sweeps", async () => {
    const context = makeContext(redis)
    const now = 1_000_000
    await scheduleModifierExpiry({
      context,
      roomId,
      sessionId,
      userId,
      modifierId,
      endAt: now - 100,
    })

    const [a, b] = await Promise.all([
      claimDueModifierExpiries({ context, now }),
      claimDueModifierExpiries({ context, now }),
    ])
    const all = [...a, ...b]
    expect(all).toHaveLength(1)
    expect(all[0]).toEqual({ roomId, sessionId, userId, modifierId })
    expect(await redis.zCard(GAME_MODIFIERS_EXPIRING_KEY)).toBe(0)
  })

  it("cancel removes modifier before expiry claim", async () => {
    const context = makeContext(redis)
    await scheduleModifierExpiry({
      context,
      roomId,
      sessionId,
      userId,
      modifierId,
      endAt: Date.now() + 60_000,
    })
    expect(
      await cancelModifierExpiry({ context, roomId, sessionId, userId, modifierId }),
    ).toBe(true)
    const claimed = await claimDueModifierExpiries({ context, now: Date.now() + 120_000 })
    expect(claimed).toHaveLength(0)
  })

  it("sweep expires a due modifier once and emits GAME_MODIFIER_REMOVED", async () => {
    const emit = vi.fn().mockResolvedValue(undefined)
    const { GameSessionService } = await import("../../services/GameSessionService")
    const context = makeContext(redis, undefined, { emit })
    const service = new GameSessionService(context)
    context.gameSessions = service

    const session: GameSession = {
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

    const now = Date.now()
    const state: UserGameState = {
      userId,
      attributes: { score: 0 } as UserGameState["attributes"],
      modifiers: [
        {
          id: modifierId,
          name: "x-ray",
          source: "item-shops",
          stackBehavior: "stack",
          startAt: now - 10_000,
          endAt: now - 1,
          effects: [],
        },
      ],
      flags: {},
    }

    await redis.set(`room:${roomId}:game:session:${sessionId}`, JSON.stringify(session))
    await redis.set(
      `room:${roomId}:game:session:${sessionId}:user:${userId}:state`,
      JSON.stringify(state),
    )
    await redis.zAdd(GAME_MODIFIERS_EXPIRING_KEY, {
      score: now - 1,
      value: modifierExpiryMember(roomId, sessionId, userId, modifierId),
    })

    const [first, second] = await Promise.all([
      sweepExpiredModifiers({ context, now }),
      sweepExpiredModifiers({ context, now }),
    ])
    const expiredTotal = first.expired + second.expired
    expect(expiredTotal).toBe(1)

    const removedCalls = emit.mock.calls.filter((c) => c[1] === "GAME_MODIFIER_REMOVED")
    expect(removedCalls).toHaveLength(1)
    expect(removedCalls[0]).toEqual([
      roomId,
      "GAME_MODIFIER_REMOVED",
      expect.objectContaining({
        roomId,
        sessionId,
        userId,
        modifierId,
        reason: "expired",
      }),
    ])

    const stored = JSON.parse(
      (await redis.get(`room:${roomId}:game:session:${sessionId}:user:${userId}:state`))!,
    ) as UserGameState
    expect(stored.modifiers).toHaveLength(0)
  })
})
