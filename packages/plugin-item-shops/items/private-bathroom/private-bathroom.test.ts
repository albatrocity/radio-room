import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { SHRINK_FLAG } from "../textEffects/sizeShift"
import { privateBathroom } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("privateBathroom", () => {
  test("removes all debuff modifiers on self", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])

    vi.mocked(deps.game.getUserState).mockResolvedValue({
      userId: actor.userId,
      attributes: { score: 0, coin: 0 },
      modifiers: [
        {
          id: "mod-shrink",
          name: "compressor",
          source: "item-shops",
          stackBehavior: "stack",
          startAt: 0,
          endAt: Date.now() + 300_000,
          effects: [{ type: "flag", name: SHRINK_FLAG, value: true, intent: "negative" }],
        },
        {
          id: "mod-boost",
          name: "boost",
          source: "item-shops",
          stackBehavior: "stack",
          startAt: 0,
          endAt: Date.now() + 300_000,
          effects: [{ type: "flag", name: "grow", value: true, intent: "positive" }],
        },
      ],
    })

    const def = createMockDefinition(privateBathroom.shortId, {
      name: privateBathroom.catalogEntry.definition.name,
    })

    const result = await invokeUse(privateBathroom, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(deps.game.removeModifier).toHaveBeenCalledTimes(1)
    expect(deps.game.removeModifier).toHaveBeenCalledWith(actor.userId, "mod-shrink")
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringContaining("slipped into the Private Bathroom"),
    )
  })

  test("removes negative effects on another user in the room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const target = userFactory.build({ userId: "target-u1", username: "riley" })
    stubRoomUsers(deps, [actor, target])

    vi.mocked(deps.game.getUserState).mockImplementation(async (uid) => {
      if (uid !== target.userId) return null
      return {
        userId: target.userId,
        attributes: { score: 0, coin: 0 },
        modifiers: [
          {
            id: "mod-gate",
            name: "gate",
            source: "item-shops",
            stackBehavior: "stack",
            startAt: 0,
            endAt: Date.now() + 300_000,
            effects: [{ type: "flag", name: "gate", value: true, intent: "negative" }],
          },
        ],
      }
    })

    const def = createMockDefinition(privateBathroom.shortId, {
      name: privateBathroom.catalogEntry.definition.name,
    })

    const result = await invokeUse(privateBathroom, deps, actor.userId, def, {
      targetUserId: target.userId,
    })

    expect(result.success).toBe(true)
    expect(deps.game.removeModifier).toHaveBeenCalledWith(target.userId, "mod-gate")
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringMatching(/ushered .* into the Private Bathroom/),
    )
  })

  test("fails when target user is not in room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const target = userFactory.build({ userId: "target-u1" })
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(
      privateBathroom,
      deps,
      actor.userId,
      createMockDefinition(privateBathroom.shortId),
      { targetUserId: target.userId },
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(deps.game.removeModifier).not.toHaveBeenCalled()
  })

  test("fails without consuming when there are no negative effects", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])

    vi.mocked(deps.game.getUserState).mockResolvedValue({
      userId: actor.userId,
      attributes: { score: 0, coin: 0 },
      modifiers: [],
    })

    const result = await invokeUse(
      privateBathroom,
      deps,
      actor.userId,
      createMockDefinition(privateBathroom.shortId),
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toContain("No negative effects")
    expect(deps.game.removeModifier).not.toHaveBeenCalled()
  })
})
