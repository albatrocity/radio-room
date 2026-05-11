import { describe, expect, it, vi } from "vitest"
import { marsEgg } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
} from "../shared/testHelpers"

describe("marsEgg", () => {
  it("pays base coinValue when held under one minute", async () => {
    const deps = createMockDeps()
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
      coinValue: 32,
    })
    const now = Date.now()
    const result = await invokeUse(marsEgg, deps, "u1", def, undefined, {
      acquiredAt: now - 30_000,
    })
    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(deps.game.addScore).toHaveBeenCalledWith("u1", "coin", 32, "item-shops:mars-egg")
  })

  it("adds 1 coin per full minute held, capped", async () => {
    const deps = createMockDeps()
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
      coinValue: 32,
    })
    const now = Date.now()
    const result = await invokeUse(marsEgg, deps, "u1", def, undefined, {
      acquiredAt: now - 5 * 60_000,
    })
    expect(result.success).toBe(true)
    expect(deps.game.addScore).toHaveBeenCalledWith("u1", "coin", 37, "item-shops:mars-egg")
  })

  it("respects appreciation cap", async () => {
    const deps = createMockDeps()
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
      coinValue: 32,
    })
    const now = Date.now()
    const result = await invokeUse(marsEgg, deps, "u1", def, undefined, {
      acquiredAt: now - 200 * 60_000,
    })
    expect(result.success).toBe(true)
    expect(deps.game.addScore).toHaveBeenCalledWith("u1", "coin", 122, "item-shops:mars-egg")
  })

  it("fails when active stack is missing", async () => {
    const deps = createMockDeps()
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
    })
    const handler = marsEgg.use!
    const result = await handler(deps, "u1", def, undefined)
    expect(result.success).toBe(false)
    expect(deps.game.addScore).not.toHaveBeenCalled()
  })

  it("sends a room system message on success", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.context.api.getUsersByIds).mockResolvedValue([
      { userId: "u1", username: "pat" } as never,
    ])
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
      coinValue: 10,
    })
    await invokeUse(marsEgg, deps, "u1", def, undefined, { acquiredAt: Date.now() })
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringMatching(/cracked a Mars Egg and collected 10 coins/),
    )
  })
})
