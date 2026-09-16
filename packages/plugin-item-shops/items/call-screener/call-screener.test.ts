import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import {
  doNotCallStateKey,
  SWEETWATER_SHOP_ID,
  sweetwaterTimerId,
} from "../../shops/sweetwater/followUps"
import { callScreener } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  createMockShopAccess,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

function setup(): {
  deps: ReturnType<typeof createMockDeps>
  shopAccess: ReturnType<typeof createMockShopAccess>
  actor: ReturnType<typeof userFactory.build>
} {
  const shopAccess = createMockShopAccess()
  const deps = createMockDeps({ shopAccess })
  const actor = userFactory.build()
  stubRoomUsers(deps, [actor])
  return { deps, shopAccess, actor }
}

function definition() {
  return createMockDefinition(callScreener.shortId, {
    name: callScreener.catalogEntry.definition.name,
    icon: callScreener.catalogEntry.definition.icon,
  })
}

describe("callScreener", () => {
  test("screens the actor and drops their pending follow-up timer", async () => {
    const { deps, shopAccess, actor } = setup()
    shopAccess.seedTimer(SWEETWATER_SHOP_ID, sweetwaterTimerId(actor.userId))

    const result = await invokeUse(callScreener, deps, actor.userId, definition())

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(shopAccess.getState(SWEETWATER_SHOP_ID, doNotCallStateKey(actor.userId))).toBe(true)
    expect(shopAccess.clearTimer).toHaveBeenCalledWith(
      SWEETWATER_SHOP_ID,
      sweetwaterTimerId(actor.userId),
    )
    expect(shopAccess.getTimer(SWEETWATER_SHOP_ID, sweetwaterTimerId(actor.userId))).toBeNull()
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringContaining("is screening their calls"),
    )
  })

  test("ignores targetUserId and screens the actor", async () => {
    const shopAccess = createMockShopAccess()
    const deps = createMockDeps({ shopAccess })
    const actor = userFactory.build()
    const other = userFactory.build({ userId: "other-u1", username: "riley" })
    stubRoomUsers(deps, [actor, other])

    const result = await invokeUse(callScreener, deps, actor.userId, definition(), {
      targetUserId: other.userId,
    })

    expect(result.success).toBe(true)
    expect(shopAccess.getState(SWEETWATER_SHOP_ID, doNotCallStateKey(actor.userId))).toBe(true)
    expect(shopAccess.getState(SWEETWATER_SHOP_ID, doNotCallStateKey(other.userId))).toBeUndefined()
  })

  test("does not consume when already screened", async () => {
    const { deps, shopAccess, actor } = setup()
    shopAccess.seedState(SWEETWATER_SHOP_ID, doNotCallStateKey(actor.userId), true)

    const result = await invokeUse(callScreener, deps, actor.userId, definition())

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toContain("already screened")
    expect(shopAccess.setState).not.toHaveBeenCalled()
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("fails without consuming when shop access is unavailable", async () => {
    const deps = createMockDeps({ shopAccess: undefined })
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(callScreener, deps, actor.userId, definition())

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("is a self-target consumable listed with no defense", () => {
    expect(callScreener.catalogEntry.definition.requiresTarget).toBe("self")
    expect(callScreener.catalogEntry.definition.consumable).toBe(true)
    expect(callScreener.catalogEntry.definition.defense).toBeUndefined()
  })
})
