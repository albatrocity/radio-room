import { describe, expect, test, vi } from "vitest"
import { CHAT_BUFFER_FLAG } from "@repo/plugin-base"
import { userFactory } from "@repo/factories"
import { bufferPedal } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("bufferPedal", () => {
  test("calls applyTimedModifier with buffer_pedal / chat_buffer flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(bufferPedal.shortId, {
      name: bufferPedal.catalogEntry.definition.name,
      icon: bufferPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(bufferPedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "buffer_pedal",
      flag: CHAT_BUFFER_FLAG,
      intent: "negative",
      durationMs: 300_000,
    })
  })

  test("fails when target user is not in room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const target = userFactory.build({ userId: "target-u1" })
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(bufferPedal.shortId)

    const result = await invokeUse(bufferPedal, deps, actor.userId, def, {
      targetUserId: target.userId,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain("not in this room")
    expect(deps.game.applyTimedModifier).not.toHaveBeenCalled()
  })

  test("reports defense_blocked", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    vi.mocked(deps.game.applyTimedModifier).mockResolvedValue({
      ok: false,
      reason: "defense_blocked",
      blockingItemName: "Warranty",
    })
    const def = createMockDefinition(bufferPedal.shortId)

    const result = await invokeUse(bufferPedal, deps, actor.userId, def)

    expect(result.success).toBe(false)
    expect(result.message).toContain("Warranty")
  })
})
