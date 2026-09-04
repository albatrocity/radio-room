import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { blackBag } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

function bagDef(overrides?: Partial<ItemDefinition>): ItemDefinition {
  return createMockDefinition(blackBag.shortId, {
    name: "Black Bag",
    icon: "PaperBag",
    rarity: "legendary",
    requiresTarget: "userInventoryItem",
    ...overrides,
  })
}

function stack(
  def: ItemDefinition,
  overrides?: Partial<InventoryItem>,
): InventoryItem {
  return {
    itemId: overrides?.itemId ?? `item-${def.shortId}`,
    definitionId: def.id,
    sourcePlugin: def.sourcePlugin,
    quantity: overrides?.quantity ?? 1,
    acquiredAt: Date.now(),
    metadata: overrides?.metadata,
    ...overrides,
  }
}

describe("blackBag", () => {
  test("steals selected bag item after defense check", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const victim = userFactory.build({ userId: "victim-1" })
    stubRoomUsers(deps, [actor, victim])

    const potion = createMockDefinition("potion", { name: "Potion", slotPool: "inventory" })
    const album = createMockDefinition("album", {
      name: "Album",
      slotPool: "collection",
    })
    const victimStacks = [
      stack(potion, { itemId: "potion-1", quantity: 2, metadata: { note: "x" } }),
      stack(album, { itemId: "album-1" }),
    ]

    vi.mocked(deps.context.inventory.getInventory).mockImplementation(async (uid) => ({
      userId: uid,
      items: uid === victim.userId ? victimStacks : [],
      maxSlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 5,
    }))
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) => {
      if (id === potion.id) return potion
      if (id === album.id) return album
      return null
    })
    vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(
      stack(potion, { itemId: "stolen-1" }),
    )

    const def = bagDef()
    const result = await invokeUse(blackBag, deps, actor.userId, def, {
      targetUserId: victim.userId,
      targetInventoryItemId: "potion-1",
    })

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(deps.game.applyTimedModifier).not.toHaveBeenCalled()
    expect(deps.game.checkModifierDefense).toHaveBeenCalledWith(
      victim.userId,
      expect.objectContaining({
        name: "black-bag",
        itemDefinitionId: def.id,
        effects: [
          expect.objectContaining({
            type: "flag",
            name: "burgled",
            intent: "negative",
          }),
        ],
      }),
      actor.userId,
      { omitBlockedModifier: true },
    )
    expect(deps.context.inventory.removeItem).toHaveBeenCalledWith(victim.userId, "potion-1", 1)
    expect(deps.context.inventory.getItemDefinitions).toHaveBeenCalledTimes(1)
    expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(
      actor.userId,
      potion.id,
      1,
      { note: "x" },
      "plugin",
    )
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalled()
    expect(deps.context.api.sendUserToast).toHaveBeenCalledWith(
      deps.context.roomId,
      victim.userId,
      expect.objectContaining({
        title: "Item stolen",
        type: "error",
        description: expect.stringContaining("Potion"),
      }),
    )
    expect(deps.context.api.sendUserSystemMessage).not.toHaveBeenCalled()
  })

  test("steals collection stacks when selected", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const victim = userFactory.build({ userId: "victim-1" })
    stubRoomUsers(deps, [actor, victim])

    const album = createMockDefinition("album", {
      name: "Album",
      slotPool: "collection",
    })
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: victim.userId,
      items: [stack(album, { itemId: "album-1" })],
      maxSlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 5,
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(album)
    vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(
      stack(album, { itemId: "stolen-album" }),
    )

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: victim.userId,
      targetInventoryItemId: "album-1",
    })

    expect(result.success).toBe(true)
    expect(deps.context.inventory.removeItem).toHaveBeenCalledWith(victim.userId, "album-1", 1)
    expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(
      actor.userId,
      album.id,
      1,
      undefined,
      "plugin",
    )
  })

  test("fails when target inventory is empty", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const victim = userFactory.build({ userId: "victim-1" })
    stubRoomUsers(deps, [actor, victim])

    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: victim.userId,
      items: [],
      maxSlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 5,
    })

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: victim.userId,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain("nothing to steal")
    expect(deps.game.checkModifierDefense).not.toHaveBeenCalled()
    expect(deps.context.inventory.removeItem).not.toHaveBeenCalled()
  })

  test("defense_blocked consumes bag and does not steal", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const victim = userFactory.build({ userId: "victim-1" })
    stubRoomUsers(deps, [actor, victim])

    const potion = createMockDefinition("potion", { name: "Potion" })
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: victim.userId,
      items: [stack(potion, { itemId: "potion-1" })],
      maxSlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 5,
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(potion)
    vi.mocked(deps.game.checkModifierDefense).mockResolvedValue({
      ok: false,
      reason: "defense_blocked",
      blockingItemName: "Warranty",
    })

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: victim.userId,
      targetInventoryItemId: "potion-1",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.message).toContain("Warranty")
    expect(deps.context.inventory.removeItem).not.toHaveBeenCalled()
    expect(deps.context.inventory.giveItem).not.toHaveBeenCalled()
  })

  test("fails when target not in room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: "missing",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toContain("not in this room")
  })

  test("rejects self-target", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: actor.userId,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain("yourself")
  })

  test("refunds victim when thief inventory is full", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const victim = userFactory.build({ userId: "victim-1" })
    stubRoomUsers(deps, [actor, victim])

    const potion = createMockDefinition("potion", { name: "Potion" })
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: victim.userId,
      items: [stack(potion, { itemId: "potion-1", metadata: { keep: 1 } })],
      maxSlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 5,
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(potion)
    vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(null)

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: victim.userId,
      targetInventoryItemId: "potion-1",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toBe("Inventory is full — nothing was stolen.")
    expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(
      victim.userId,
      potion.id,
      1,
      { keep: 1 },
      "plugin",
    )
  })

  test("fails when selected stack missing", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const victim = userFactory.build({ userId: "victim-1" })
    stubRoomUsers(deps, [actor, victim])

    const potion = createMockDefinition("potion", { name: "Potion" })
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: victim.userId,
      items: [stack(potion, { itemId: "potion-1" })],
      maxSlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 5,
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(potion)

    const result = await invokeUse(blackBag, deps, actor.userId, bagDef(), {
      targetUserId: victim.userId,
      targetInventoryItemId: "gone",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(deps.game.checkModifierDefense).not.toHaveBeenCalled()
  })
})
