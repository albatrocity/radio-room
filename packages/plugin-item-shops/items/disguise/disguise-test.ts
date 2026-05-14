import { describe, expect, it, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { ANONYMOUS_ACTIONS_FLAG } from "@repo/plugin-base"
import type { UserGameState } from "@repo/types"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import { disguise } from "./index"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"

describe("disguise", () => {
  it("registers the expected shortId", () => {
    expect(disguise.shortId).toBe("disguise")
  })

  it("applies anonymous_actions flag for 5 minutes", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(disguise.shortId, {
      name: disguise.catalogEntry.definition.name,
      icon: disguise.catalogEntry.definition.icon,
    })

    const result = await invokeUse(disguise, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "disguise",
      flag: ANONYMOUS_ACTIONS_FLAG,
      intent: "neutral",
      durationMs: 5 * 60 * 1000,
      visibility: "self",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      deps.context.roomId,
      `Someone went anonymous (Disguise — 5 min).`,
    )
  })

  it("resolveItemUseActorDisplayName returns Someone when game state has anonymous_actions", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(disguise.shortId, {
      name: disguise.catalogEntry.definition.name,
      icon: disguise.catalogEntry.definition.icon,
    })

    await invokeUse(disguise, deps, actor.userId, def)

    // applyTimedModifier is mocked — it does not persist modifiers. Mirror post-use state:
    const now = Date.now()
    const withAnonymousFlag: UserGameState = {
      userId: actor.userId,
      attributes: {
        score: 0,
        coin: 0,
      },
      modifiers: [
        {
          id: "m1",
          name: "disguise",
          source: "item-shops",
          stackBehavior: "stack",
          startAt: now - 1000,
          endAt: now + 5 * 60 * 1000,
          effects: [{ type: "flag", name: ANONYMOUS_ACTIONS_FLAG, value: true }],
        },
      ],
    }
    vi.mocked(deps.game.getUserState).mockImplementation(async (uid: string) =>
      uid === actor.userId ? withAnonymousFlag : null,
    )

    const testItemResult = await invokeUse(
      {
        shortId: "test",
        use: async (d, userId) => {
          const label = await resolveItemUseActorDisplayName(d, userId)
          await d.context.api.sendSystemMessage(d.context.roomId, `${label} did a naughty thing`)
          return { success: true, consumed: true, message: "Test Item used." }
        },
        catalogEntry: {
          definition: {
            name: "Test Item",
            icon: "Star",
            shortId: "test",
            description: "Test item",
            stackable: true,
            maxStack: 3,
            tradeable: true,
            consumable: true,
            coinValue: 50,
            rarity: "common",
          },
        },
      },
      deps,
      actor.userId,
      createMockDefinition("test", { name: "Test Item" }),
    )

    expect(testItemResult.success).toBe(true)
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      deps.context.roomId,
      "Someone did a naughty thing",
    )
  })
})
