import { describe, test, expect, vi, beforeEach } from "vitest"
import type { GameSession, GameStateModifier, UserGameState } from "@repo/types"
import { PluginGameSessionAPI } from "./PluginGameSessionAPI"

const ROOM_ID = "room-1"
const USER_ID = "user-1"
const PLUGIN_NAME = "test-plugin"
const NOW = 1_700_000_000_000

describe("PluginGameSessionAPI.applyTimedModifier", () => {
  let mockService: {
    getActiveSession: ReturnType<typeof vi.fn>
    getUserState: ReturnType<typeof vi.fn>
    applyModifier: ReturnType<typeof vi.fn>
  }
  let api: PluginGameSessionAPI

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockService = {
      getActiveSession: vi.fn(async () => ({ id: "session-1" }) as GameSession),
      getUserState: vi.fn(),
      applyModifier: vi.fn(async () => ({ ok: true as const, modifierId: "new-modifier-id" })),
    }
    const ctx = { gameSessions: mockService } as never
    api = new PluginGameSessionAPI(ctx, PLUGIN_NAME, ROOM_ID)
  })

  function modifier(
    overrides: Partial<GameStateModifier> & { name: string },
  ): GameStateModifier {
    return {
      id: `id-${Math.random()}`,
      source: PLUGIN_NAME,
      effects: [{ type: "flag", name: "flag-x", value: true }],
      startAt: NOW - 1000,
      endAt: NOW + 60_000,
      stackBehavior: "stack",
      ...overrides,
      name: overrides.name,
    }
  }

  function setUserState(modifiers: GameStateModifier[]) {
    mockService.getUserState.mockResolvedValue({
      userId: USER_ID,
      attributes: {},
      modifiers,
    } as UserGameState)
  }

  test("first stack application uses durationMs as endAt offset", async () => {
    setUserState([])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "stack",
    })

    expect(mockService.applyModifier).toHaveBeenCalledTimes(1)
    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.startAt).toBe(NOW)
    expect(applied.endAt).toBe(NOW + 5 * 60_000)
  })

  test("second stack application accumulates remaining time onto new endAt", async () => {
    const existingEndAt = NOW + 3 * 60_000
    setUserState([
      modifier({
        id: "existing-1",
        name: "compressor",
        startAt: NOW - 2 * 60_000,
        endAt: existingEndAt,
      }),
    ])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "stack",
    })

    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.startAt).toBe(NOW)
    expect(applied.endAt).toBe(existingEndAt + 5 * 60_000)
  })

  test("uses the latest endAt among multiple existing same-name modifiers", async () => {
    const oldEnd = NOW + 1 * 60_000
    const newEnd = NOW + 8 * 60_000
    setUserState([
      modifier({ id: "stack-1", name: "compressor", endAt: oldEnd }),
      modifier({ id: "stack-2", name: "compressor", endAt: newEnd }),
    ])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "stack",
    })

    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.endAt).toBe(newEnd + 5 * 60_000)
  })

  test("ignores expired same-name modifiers when computing endAt", async () => {
    setUserState([
      modifier({
        id: "expired",
        name: "compressor",
        startAt: NOW - 10 * 60_000,
        endAt: NOW - 1, // already expired
      }),
    ])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "stack",
    })

    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.endAt).toBe(NOW + 5 * 60_000)
  })

  test("only matches modifiers with the same name", async () => {
    setUserState([
      modifier({
        id: "boost-stack",
        name: "boost",
        endAt: NOW + 10 * 60_000,
      }),
    ])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "stack",
    })

    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.endAt).toBe(NOW + 5 * 60_000)
  })

  test("does not accumulate when stackBehavior is replace", async () => {
    setUserState([
      modifier({ id: "existing", name: "compressor", endAt: NOW + 8 * 60_000 }),
    ])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "replace",
    })

    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.endAt).toBe(NOW + 5 * 60_000)
  })

  test("does not accumulate when stackBehavior is extend", async () => {
    setUserState([
      modifier({ id: "existing", name: "compressor", endAt: NOW + 8 * 60_000 }),
    ])

    await api.applyTimedModifier(USER_ID, 5 * 60_000, {
      name: "compressor",
      effects: [{ type: "flag", name: "shrink", value: true }],
      stackBehavior: "extend",
    })

    const [, , , applied] = mockService.applyModifier.mock.calls[0]!
    expect(applied.endAt).toBe(NOW + 5 * 60_000)
  })

  test("returns the modifier id from applyModifier", async () => {
    setUserState([])
    mockService.applyModifier.mockResolvedValueOnce({ ok: true, modifierId: "custom-id" })

    const result = await api.applyTimedModifier(USER_ID, 5_000, {
      name: "x",
      effects: [],
      stackBehavior: "replace",
    })

    expect(result).toEqual({ ok: true, modifierId: "custom-id" })
  })
})
