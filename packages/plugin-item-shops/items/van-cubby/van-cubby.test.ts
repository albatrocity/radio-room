import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { PHYSICAL_MEDIA_CONDITION_KEY } from "@repo/types"
import { vanCubby } from "./index"
import { merchCashBox } from "../merch-cash-box"
import { roadCase } from "../road-case"
import { trailer } from "../trailer"
import {
  createMockDefinition,
  createMockDeps,
  createMockInventoryStack,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

const actorId = "u-stash"

function setupBag(
  extra?: {
    items?: ReturnType<typeof createMockInventoryStack>[]
    store?: ReturnType<typeof vi.fn>
    coins?: number
  },
) {
  const deps = createMockDeps()
  const actor = userFactory.build({ userId: actorId, username: "Ross" })
  stubRoomUsers(deps, [actor])
  vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
    userId: actorId,
    items: extra?.items ?? [],
    maxSlots: 20,
    maxCollectionSlots: 20,
    maxPlaybackSlots: 20,
  })
  vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
  vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(
    createMockInventoryStack(createMockDefinition("refund")),
  )
  if (extra?.store) {
    vi.mocked(deps.context.artifacts.store).mockImplementation(extra.store as never)
  }
  vi.mocked(deps.game.getUserState).mockResolvedValue({
    userId: actorId,
    attributes: { coin: extra?.coins ?? 100 },
    modifiers: [],
  } as never)
  return { deps, actor }
}

describe("container store payloads", () => {
  test("van-cubby writes contents metadata and containerDefinitionId", async () => {
    const targetDef = createMockDefinition("mars-egg", { name: "Mars Egg", id: "item-shops:mars-egg" })
    const cubbyDef = createMockDefinition("van-cubby", {
      name: "Van Cubby",
      id: "item-shops:van-cubby",
      storageCapacity: 1,
    })
    const target = createMockInventoryStack(targetDef, {
      itemId: "egg-1",
      metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
    })
    const { deps } = setupBag({ items: [target] })
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) =>
      id === targetDef.id ? targetDef : cubbyDef,
    )

    const result = await invokeUse(vanCubby, deps, actorId, cubbyDef, {
      targetInventoryItemIds: ["egg-1"],
      password: "secret",
      label: "Mine",
      note: "hint: birds",
    })
    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(deps.context.artifacts.store).toHaveBeenCalledWith(
      expect.objectContaining({
        storingItemId: "van-cubby",
        containerDefinitionId: "item-shops:van-cubby",
        label: "Mine",
        note: "hint: birds",
        contents: [
          expect.objectContaining({
            kind: "item",
            itemDefinitionId: "item-shops:mars-egg",
            itemName: "Mars Egg",
            metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
          }),
        ],
      }),
    )
  })

  test("merch-cash-box writes a coin content row", async () => {
    const boxDef = createMockDefinition("merch-cash-box", {
      name: "Merch Cash Box",
      id: "item-shops:merch-cash-box",
      storageCapacity: 1,
    })
    const { deps } = setupBag({ coins: 400 })
    const result = await invokeUse(merchCashBox, deps, actorId, boxDef, {
      coinAmount: 329,
      password: "counting crows",
    })
    expect(result.success).toBe(true)
    expect(deps.context.artifacts.store).toHaveBeenCalledWith(
      expect.objectContaining({
        containerDefinitionId: "item-shops:merch-cash-box",
        contents: [{ kind: "coin", coinValue: 329 }],
      }),
    )
    expect(deps.game.addScore).toHaveBeenCalledWith(actorId, "coin", -329, "merch-cash-box:store", {
      intent: "exact",
    })
  })

  test("rejects nesting another container", async () => {
    const inner = createMockDefinition("road-case", {
      name: "Road Case",
      id: "item-shops:road-case",
      storageCapacity: 3,
    })
    const outer = createMockDefinition("trailer", {
      name: "Trailer",
      id: "item-shops:trailer",
      storageCapacity: 5,
    })
    const stack = createMockInventoryStack(inner, { itemId: "case-1" })
    const { deps } = setupBag({ items: [stack] })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(inner)
    const result = await invokeUse(trailer, deps, actorId, outer, {
      targetInventoryItemIds: ["case-1"],
      password: "pw",
    })
    expect(result).toMatchObject({ success: false, consumed: false })
    expect(deps.context.artifacts.store).not.toHaveBeenCalled()
  })

  test("rejects over-capacity at create time", async () => {
    const pedal = createMockDefinition("boost-pedal", { name: "Boost Pedal", id: "item-shops:boost-pedal" })
    const caseDef = createMockDefinition("road-case", {
      name: "Road Case",
      id: "item-shops:road-case",
      storageCapacity: 3,
    })
    const items = [1, 2, 3, 4].map((n) =>
      createMockInventoryStack(pedal, { itemId: `p-${n}` }),
    )
    const { deps } = setupBag({ items })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(pedal)
    const result = await invokeUse(roadCase, deps, actorId, caseDef, {
      targetInventoryItemIds: items.map((i) => i.itemId),
      password: "pw",
    })
    expect(result.success).toBe(false)
    expect(deps.context.artifacts.store).not.toHaveBeenCalled()
  })

  test("refunds every removed stack with original metadata if store throws", async () => {
    const targetDef = createMockDefinition("mars-egg", { name: "Mars Egg", id: "item-shops:mars-egg" })
    const cubbyDef = createMockDefinition("van-cubby", {
      name: "Van Cubby",
      id: "item-shops:van-cubby",
      storageCapacity: 1,
    })
    const target = createMockInventoryStack(targetDef, {
      itemId: "egg-1",
      metadata: { stamped: true },
    })
    const { deps } = setupBag({
      items: [target],
      store: vi.fn().mockRejectedValue(new Error("redis down")),
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockResolvedValue(targetDef)
    const result = await invokeUse(vanCubby, deps, actorId, cubbyDef, {
      targetInventoryItemIds: ["egg-1"],
      password: "pw",
    })
    expect(result.success).toBe(false)
    expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(
      actorId,
      "item-shops:mars-egg",
      1,
      { stamped: true },
      "plugin",
    )
  })
})
