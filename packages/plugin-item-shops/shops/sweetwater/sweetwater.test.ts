import type { ShopBuyContext } from "@repo/plugin-base/helpers"
import { describe, expect, test, vi } from "vitest"
import { doNotCallStateKey, sweetwaterTimerId } from "./followUps"
import { SWEETWATER_SHOP } from "./index"

function createBuyContext(overrides?: Partial<ShopBuyContext>): {
  ctx: ShopBuyContext
  state: Map<string, unknown>
} {
  const state = new Map<string, unknown>()

  const ctx = {
    roomId: "room-1",
    userId: "u1",
    username: "chuckfan",
    itemShortId: "boost-pedal",
    itemName: "Boost Pedal",

    startTimer: vi.fn(),
    getTimer: vi.fn((id: string) => null),
    clearTimer: vi.fn(),
    schedule: vi.fn().mockResolvedValue({ ok: true, fireAt: Date.now() + 600_000 }),
    cancelSchedule: vi.fn().mockResolvedValue(true),

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

  return { ctx, state }
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
    const { ctx, state } = createBuyContext()

    await SWEETWATER_SHOP.onBuy!(ctx)

    expect(state.get("u1")).toEqual({ username: "chuckfan", lastPurchasedItemName: "Boost Pedal" })
    expect(ctx.schedule).toHaveBeenCalledWith({
      id: sweetwaterTimerId("u1"),
      kind: "sweetwater-followup",
      durationMs: 10 * 60 * 1000,
      payload: { userId: "u1" },
    })
  })

  test("onBuy still records the purchase but schedules nothing when screened", async () => {
    const { ctx, state } = createBuyContext()
    state.set(doNotCallStateKey("u1"), true)

    await SWEETWATER_SHOP.onBuy!(ctx)

    expect(state.get("u1")).toEqual({ username: "chuckfan", lastPurchasedItemName: "Boost Pedal" })
    expect(ctx.schedule).not.toHaveBeenCalled()
  })

  test("onBuy does not schedule a second timer when one is already pending", async () => {
    const { ctx } = createBuyContext()
    vi.mocked(ctx.getTimer).mockReturnValue({ id: sweetwaterTimerId("u1") } as any)

    await SWEETWATER_SHOP.onBuy!(ctx)

    expect(ctx.schedule).not.toHaveBeenCalled()
  })
})
