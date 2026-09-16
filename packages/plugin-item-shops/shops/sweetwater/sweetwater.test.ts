import type { ShopBuyContext } from "@repo/plugin-base/helpers"
import { describe, expect, test, vi } from "vitest"
import { doNotCallStateKey, sweetwaterTimerId } from "./followUps"
import { SWEETWATER_SHOP } from "./index"

type TimerRegistration = { duration: number; callback: () => Promise<void> | void }

function createBuyContext(overrides?: Partial<ShopBuyContext>): {
  ctx: ShopBuyContext
  state: Map<string, unknown>
  timers: Map<string, TimerRegistration>
} {
  const state = new Map<string, unknown>()
  const timers = new Map<string, TimerRegistration>()

  const ctx = {
    roomId: "room-1",
    userId: "u1",
    username: "chuckfan",
    itemShortId: "boost-pedal",
    itemName: "Boost Pedal",

    startTimer: vi.fn((id: string, config: TimerRegistration) => {
      timers.set(id, config)
    }),
    getTimer: vi.fn((id: string) => (timers.has(id) ? { id } : null)),
    clearTimer: vi.fn((id: string) => timers.delete(id)),

    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserSystemMessage: vi.fn().mockResolvedValue(undefined),

    isShoppingActive: vi.fn().mockResolvedValue(true),
    isGameSessionActive: vi.fn().mockResolvedValue(true),
    isUserInRoom: vi.fn().mockResolvedValue(true),

    getState: vi.fn(<T>(key: string) => state.get(key) as T | undefined),
    setState: vi.fn(<T>(key: string, value: T) => {
      state.set(key, value)
    }),
    deleteState: vi.fn((key: string) => {
      state.delete(key)
    }),
    ...overrides,
  } as unknown as ShopBuyContext

  return { ctx, state, timers }
}

describe("SWEETWATER_SHOP", () => {
  test("opening DM uses the info alert variant", () => {
    expect(SWEETWATER_SHOP.openingMessageMeta).toEqual({
      type: "alert",
      status: "info",
      title: "Message from your Sweetwater Rep",
    })
  })

  test("onBuy records the purchase and schedules a follow-up", async () => {
    const { ctx, state, timers } = createBuyContext()

    await SWEETWATER_SHOP.onBuy!(ctx)

    expect(state.get("u1")).toEqual({ username: "chuckfan", lastPurchasedItemName: "Boost Pedal" })
    const timer = timers.get(sweetwaterTimerId("u1"))
    expect(timer?.duration).toBe(10 * 60 * 1000)
  })

  test("onBuy still records the purchase but schedules nothing when screened", async () => {
    const { ctx, state, timers } = createBuyContext()
    state.set(doNotCallStateKey("u1"), true)

    await SWEETWATER_SHOP.onBuy!(ctx)

    expect(state.get("u1")).toEqual({ username: "chuckfan", lastPurchasedItemName: "Boost Pedal" })
    expect(timers.size).toBe(0)
    expect(ctx.startTimer).not.toHaveBeenCalled()
  })

  test("follow-up DMs the buyer and reschedules", async () => {
    const { ctx, timers } = createBuyContext()
    await SWEETWATER_SHOP.onBuy!(ctx)

    await timers.get(sweetwaterTimerId("u1"))!.callback()

    expect(ctx.sendUserSystemMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("Boost Pedal"),
      SWEETWATER_SHOP.openingMessageMeta,
    )
    expect(timers.get(sweetwaterTimerId("u1"))).toBeDefined()
  })

  test("follow-up sends nothing and clears its timer once screened", async () => {
    const { ctx, state, timers } = createBuyContext()
    await SWEETWATER_SHOP.onBuy!(ctx)
    const scheduled = timers.get(sweetwaterTimerId("u1"))!

    // Call Screener used after the purchase, before the timer fires.
    state.set(doNotCallStateKey("u1"), true)
    await scheduled.callback()

    expect(ctx.sendUserSystemMessage).not.toHaveBeenCalled()
    expect(ctx.clearTimer).toHaveBeenCalledWith(sweetwaterTimerId("u1"))
    expect(timers.has(sweetwaterTimerId("u1"))).toBe(false)
  })

  test("follow-up stops and forgets the buyer when the game session ends", async () => {
    const { ctx, state, timers } = createBuyContext()
    await SWEETWATER_SHOP.onBuy!(ctx)
    vi.mocked(ctx.isGameSessionActive).mockResolvedValue(false)

    await timers.get(sweetwaterTimerId("u1"))!.callback()

    expect(ctx.sendUserSystemMessage).not.toHaveBeenCalled()
    expect(state.has("u1")).toBe(false)
  })
})
