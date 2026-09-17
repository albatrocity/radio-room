import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { userFactory } from "@repo/factories"
import { STASH_PICKABLE_AFTER_MS } from "@repo/game-logic"
import type { ArtifactAccessGrant, PresentedIdentityGrant, StoredArtifactPublic } from "@repo/types"
import { lockPick } from "./index"
import { locksmithsKit } from "../locksmiths-kit"
import type { CrackResolver } from "../shared/crackStash"
import { useLockPickingItem } from "../shared/lockPicking"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import type { Item } from "../shared/types"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

function definition(shortId = lockPick.shortId) {
  return createMockDefinition(shortId, {
    name: lockPick.catalogEntry.definition.name,
    icon: lockPick.catalogEntry.definition.icon,
    shortId,
  })
}

function pickableArtifact(overrides?: Partial<StoredArtifactPublic>): StoredArtifactPublic {
  return {
    id: "artifact-1",
    storingPlugin: "item-shops",
    storingItemId: "item-1",
    artifactType: "item",
    storedAt: NOW - 90 * DAY_MS,
    lastTouchedAt: NOW - 61 * DAY_MS,
    storedByUserId: "other-user",
    storedByUsername: "SecretOwner",
    label: "SUPER_SECRET_LABEL_XYZ",
    note: "password-hint-note-abc",
    containerName: "Road Case",
    contents: [],
    ...overrides,
  }
}

function seedGetPublic(
  deps: ReturnType<typeof createMockDeps>,
  artifact: StoredArtifactPublic | null,
): void {
  vi.mocked(deps.context.artifacts!.getPublic).mockResolvedValue(artifact)
}

function seedSuccessfulGrant(deps: ReturnType<typeof createMockDeps>): void {
  const grant: ArtifactAccessGrant = {
    artifactId: "artifact-1",
    userId: "actor-1",
    source: "lock-pick",
    roomId: "room-1",
    issuedAt: NOW,
    expiresAt: NOW + 10 * 60 * 1000,
  }
  vi.mocked(deps.context.artifacts!.grantAccess).mockResolvedValue(grant)
}

function wiredItem<T extends Item>(
  item: T,
  options: Parameters<typeof useLockPickingItem>[0],
): T {
  return { ...item, use: useLockPickingItem(options) } as T
}

describe("lockPick", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("refuses without targetArtifactId — item kept, no grant, no room line", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(lockPick, deps, actor.userId, definition())

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toContain("Pick a stash")
    expect(deps.context.artifacts!.grantAccess).not.toHaveBeenCalled()
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("refuses when getPublic returns null — item kept", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, null)

    const result = await invokeUse(lockPick, deps, actor.userId, definition(), {
      targetArtifactId: "missing",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toContain("no longer here")
    expect(deps.context.artifacts!.grantAccess).not.toHaveBeenCalled()
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("refuses ineligible stash without consuming — message mentions two months", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(
      deps,
      pickableArtifact({ lastTouchedAt: NOW - 30 * DAY_MS, storedAt: NOW - 30 * DAY_MS }),
    )

    const result = await invokeUse(lockPick, deps, actor.userId, definition(), {
      targetArtifactId: "artifact-1",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toMatch(/two months/i)
    expect(deps.context.artifacts!.grantAccess).not.toHaveBeenCalled()
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("legacy row without lastTouchedAt is eligible when storedAt is old enough", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(
      deps,
      pickableArtifact({ lastTouchedAt: undefined, storedAt: NOW - 90 * DAY_MS }),
    )
    seedSuccessfulGrant(deps)

    const result = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
  })

  test("59-day boundary is ineligible; 60-day boundary is eligible", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])

    seedGetPublic(deps, pickableArtifact({ lastTouchedAt: NOW - 59 * DAY_MS }))
    const tooSoon = await invokeUse(lockPick, deps, actor.userId, definition(), {
      targetArtifactId: "artifact-1",
    })
    expect(tooSoon.consumed).toBe(false)

    seedGetPublic(deps, pickableArtifact({ lastTouchedAt: NOW - STASH_PICKABLE_AFTER_MS }))
    seedSuccessfulGrant(deps)
    const eligible = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )
    expect(eligible.success).toBe(true)
    expect(eligible.consumed).toBe(true)
  })

  test("failed roll consumes item with warning toast — no grant, no room line", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, pickableArtifact())

    const result = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0.99 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.toastType).toBe("warning")
    expect(result.title).toBe("The lock holds")
    expect(deps.context.artifacts!.grantAccess).not.toHaveBeenCalled()
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("success grants access and posts room line with container name", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1", username: "Alice" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, pickableArtifact())
    seedSuccessfulGrant(deps)

    const result = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(deps.context.artifacts!.grantAccess).toHaveBeenCalledTimes(1)
    expect(deps.context.artifacts!.grantAccess).toHaveBeenCalledWith({
      artifactId: "artifact-1",
      userId: actor.userId,
      source: "lock-pick",
      roomId: "room-1",
    })
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringMatching(/picked the lock on Road Case in storage/i),
    )
  })

  test("room line uses masked attribution when presented identity is engaged", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1", username: "Alice" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, pickableArtifact())
    seedSuccessfulGrant(deps)

    const grant: PresentedIdentityGrant = {
      userId: actor.userId,
      label: "Somebody",
      chromeLabel: "Disguise",
      icon: "HatGlasses",
      engaged: true,
      toggleable: true,
      expiresAt: NOW + 5 * 60 * 1000,
      source: "item-shops:disguise",
      sessionId: "s1",
    }
    vi.mocked(deps.game.getPresentedIdentity).mockResolvedValue(grant)

    await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringContaining("Somebody picked the lock"),
      { maskedUserIds: [actor.userId], maskedLabel: "Somebody" },
    )
  })

  test("room line never includes label, note, or storedByUsername", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1", username: "Alice" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, pickableArtifact())
    seedSuccessfulGrant(deps)

    await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    const [[, content]] = vi.mocked(deps.context.api.sendSystemMessage).mock.calls
    expect(String(content)).not.toContain("SUPER_SECRET_LABEL_XYZ")
    expect(String(content)).not.toContain("password-hint-note-abc")
    expect(String(content)).not.toContain("SecretOwner")
  })

  test("grantAccess returning null does not consume the item", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, pickableArtifact())
    vi.mocked(deps.context.artifacts!.grantAccess).mockResolvedValue(null)

    const result = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random: () => 0 }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("deferred resolver consumes without grant or room line", async () => {
    const deferred: CrackResolver = async () => ({
      status: "deferred",
      message: "Minigame not ready.",
    })
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(deps, [actor])
    seedGetPublic(deps, pickableArtifact())

    const result = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, resolve: deferred }),
      deps,
      actor.userId,
      definition(),
      { targetArtifactId: "artifact-1" },
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.message).toBe("Minigame not ready.")
    expect(deps.context.artifacts!.grantAccess).not.toHaveBeenCalled()
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  test("odds at 0.5: lock pick fails, locksmith kit succeeds", async () => {
    const random = () => 0.5

    const pickDeps = createMockDeps()
    const pickActor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(pickDeps, [pickActor])
    seedGetPublic(pickDeps, pickableArtifact())

    const pickResult = await invokeUse(
      wiredItem(lockPick, { successChance: 0.3, random }),
      pickDeps,
      pickActor.userId,
      definition(lockPick.shortId),
      { targetArtifactId: "artifact-1" },
    )
    expect(pickResult.success).toBe(false)
    expect(pickResult.consumed).toBe(true)
    expect(pickDeps.context.artifacts!.grantAccess).not.toHaveBeenCalled()

    const kitDeps = createMockDeps()
    const kitActor = userFactory.build({ userId: "actor-1" })
    stubRoomUsers(kitDeps, [kitActor])
    seedGetPublic(kitDeps, pickableArtifact())
    seedSuccessfulGrant(kitDeps)

    const kitResult = await invokeUse(
      wiredItem(locksmithsKit, { successChance: 0.75, random }),
      kitDeps,
      kitActor.userId,
      definition(locksmithsKit.shortId),
      { targetArtifactId: "artifact-1" },
    )
    expect(kitResult.success).toBe(true)
    expect(kitResult.consumed).toBe(true)
    expect(kitDeps.context.artifacts!.grantAccess).toHaveBeenCalled()
  })
})
