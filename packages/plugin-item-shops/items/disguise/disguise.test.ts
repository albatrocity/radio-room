import { describe, expect, it, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { ANONYMOUS_ACTIONS_FLAG } from "@repo/plugin-base"
import type { PresentedIdentityGrant } from "@repo/types"
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

  it("applies anonymous_actions timer and grants toggleable presented identity", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(disguise.shortId, {
      name: disguise.catalogEntry.definition.name,
      icon: disguise.catalogEntry.definition.icon,
    })

    const grant: PresentedIdentityGrant = {
      userId: actor.userId,
      label: "Somebody",
      chromeLabel: "Disguise",
      icon: "HatGlasses",
      engaged: true,
      toggleable: true,
      expiresAt: Date.now() + 5 * 60 * 1000,
      source: "item-shops:disguise",
      sessionId: "s1",
    }
    vi.mocked(deps.game.grantPresentedIdentity).mockResolvedValue(grant)
    vi.mocked(deps.game.getPresentedIdentity).mockResolvedValue(grant)

    const result = await invokeUse(disguise, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "disguise",
      flag: ANONYMOUS_ACTIONS_FLAG,
      intent: "neutral",
      durationMs: 5 * 60 * 1000,
      visibility: "self",
    })
    expect(deps.game.grantPresentedIdentity).toHaveBeenCalledWith({
      userId: actor.userId,
      label: "Somebody",
      chromeLabel: "Disguise",
      icon: "HatGlasses",
      toggleable: true,
      engaged: true,
      durationMs: 5 * 60 * 1000,
      source: "item-shops:disguise",
      // Bound to the timed modifier so core clears the grant with it (ADR 0150).
      modifierId: "mod-1",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      deps.context.roomId,
      `Somebody put on a disguise and became unrecognizable. (Disguise — 5 min).`,
      { maskedUserIds: [actor.userId], maskedLabel: "Somebody" },
    )
  })

  it("resolveItemUseActorDisplayName returns Somebody when presented identity is engaged", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "Alice" })
    stubRoomUsers(deps, [actor])

    const grant: PresentedIdentityGrant = {
      userId: actor.userId,
      label: "Somebody",
      chromeLabel: "Disguise",
      icon: "HatGlasses",
      engaged: true,
      toggleable: true,
      expiresAt: Date.now() + 5 * 60 * 1000,
      source: "item-shops:disguise",
      sessionId: "s1",
    }
    vi.mocked(deps.game.getPresentedIdentity).mockResolvedValue(grant)

    const label = await resolveItemUseActorDisplayName(deps, actor.userId)
    expect(label).toEqual({
      label: "Somebody",
      userId: actor.userId,
      anonymous: true,
    })
  })

  it("resolveItemUseActorDisplayName returns real name when grant is disengaged", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "Alice" })
    stubRoomUsers(deps, [actor])

    const grant: PresentedIdentityGrant = {
      userId: actor.userId,
      label: "Somebody",
      chromeLabel: "Disguise",
      icon: "HatGlasses",
      engaged: false,
      toggleable: true,
      expiresAt: Date.now() + 5 * 60 * 1000,
      source: "item-shops:disguise",
      sessionId: "s1",
    }
    vi.mocked(deps.game.getPresentedIdentity).mockResolvedValue(grant)

    const label = await resolveItemUseActorDisplayName(deps, actor.userId)
    expect(label).toEqual({
      label: "Alice",
      userId: actor.userId,
      anonymous: false,
    })
  })
})
