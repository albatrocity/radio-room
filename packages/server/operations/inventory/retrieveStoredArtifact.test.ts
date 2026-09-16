import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, StoredArtifact } from "@repo/types"
import { retrieveStoredArtifact } from "./retrieveStoredArtifact"

vi.mock("./transferEvents", () => ({
  displayName: async () => "Ross",
}))
vi.mock("../polls/postSystemChatMessage", () => ({
  postSystemChatMessage: vi.fn().mockResolvedValue(undefined),
}))

import { postSystemChatMessage } from "../polls/postSystemChatMessage"

const roomId = "room1"
const userId = "u1"

function legacyItem(overrides?: Partial<StoredArtifact>): StoredArtifact {
  return {
    id: "3448e696-d86a-46ab-a18a-d61dba076718",
    storingPlugin: "item-shops",
    storingItemId: "van-cubby",
    artifactType: "item",
    itemDefinitionId: "item-shops:mars-egg",
    itemName: "Mars Egg",
    itemQuantity: 1,
    storedAt: 1,
    storedByUserId: "x",
    storedByUsername: "Ross",
    password: "eggsonmars",
    ...overrides,
  }
}

function makeContext(opts?: {
  artifact?: StoredArtifact
  giveItem?: ReturnType<typeof vi.fn>
  inventoryItems?: { itemId: string; definitionId: string; quantity: number }[]
}) {
  const artifact = opts?.artifact ?? legacyItem()
  const giveItem =
    opts?.giveItem ??
    vi
      .fn()
      .mockResolvedValue({
        itemId: "given-1",
        definitionId: artifact.itemDefinitionId,
        quantity: 1,
      })
  const addScore = vi.fn().mockResolvedValue(0)
  const remove = vi.fn().mockResolvedValue(true)
  const update = vi.fn().mockResolvedValue(artifact)
  const artifacts = {
    withArtifactLock: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    attemptRetrieve: vi.fn().mockResolvedValue({ status: "success", artifact }),
    remove,
    update,
  }
  const inventory = {
    getInventory: vi.fn().mockResolvedValue({
      userId,
      items: opts?.inventoryItems ?? [],
      maxSlots: 3,
      maxCollectionSlots: 12,
      maxPlaybackSlots: 2,
    }),
    getItemDefinitions: vi.fn().mockResolvedValue([
      {
        id: "item-shops:mars-egg",
        shortId: "mars-egg",
        sourcePlugin: "item-shops",
        name: "Mars Egg",
        description: "",
        stackable: false,
        maxStack: 1,
        tradeable: true,
        consumable: false,
      },
      {
        id: "item-shops:van-cubby",
        shortId: "van-cubby",
        sourcePlugin: "item-shops",
        name: "Van Cubby",
        description: "",
        stackable: false,
        maxStack: 1,
        tradeable: true,
        consumable: true,
        storageCapacity: 1,
      },
      {
        id: "item-shops:road-case",
        shortId: "road-case",
        sourcePlugin: "item-shops",
        name: "Road Case",
        description: "",
        stackable: false,
        maxStack: 1,
        tradeable: true,
        consumable: true,
        storageCapacity: 3,
      },
    ]),
    getItemDefinition: vi.fn().mockImplementation(async (_room: string, id: string) => {
      if (id === "item-shops:van-cubby") {
        return { id, name: "Van Cubby", storageCapacity: 1, slotPool: "inventory" }
      }
      if (id === "item-shops:road-case") {
        return { id, name: "Road Case", storageCapacity: 3, slotPool: "inventory" }
      }
      return { id, name: "Mars Egg", slotPool: "inventory" }
    }),
    giveItem,
    removeItem: vi.fn().mockResolvedValue(true),
  }
  const context = {
    artifacts,
    inventory,
    gameSessions: { addScore },
  } as unknown as AppContext
  return { context, artifacts, inventory, giveItem, addScore, remove, update }
}

describe("retrieveStoredArtifact", () => {
  beforeEach(() => {
    vi.mocked(postSystemChatMessage).mockClear()
  })

  test("legacy item: giveItem gets no container and copy stays identical", async () => {
    const { context, giveItem, remove } = makeContext()
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "3448e696-d86a-46ab-a18a-d61dba076718",
      password: "eggsonmars",
    })
    expect(result).toEqual({ success: true, message: "Received Mars Egg." })
    expect(giveItem).toHaveBeenCalledWith(
      roomId,
      userId,
      "item-shops:mars-egg",
      1,
      undefined,
      "plugin",
    )
    expect(giveItem).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith("3448e696-d86a-46ab-a18a-d61dba076718")
    expect(postSystemChatMessage).toHaveBeenCalledWith({
      context,
      roomId,
      content: "Ross retrieved Mars Egg from storage.",
    })
  })

  test("legacy coin: addScore uses intent exact", async () => {
    const artifact = legacyItem({
      id: "b3befc05-edaf-4717-92ed-8e8e65ea164b",
      storingItemId: "merch-cash-box",
      artifactType: "coin",
      coinValue: 329,
      itemDefinitionId: undefined,
      itemName: undefined,
      itemQuantity: undefined,
      password: "counting crows",
    })
    const { context, addScore } = makeContext({ artifact })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: artifact.id,
      password: "counting crows",
    })
    expect(result).toEqual({ success: true, message: "Added 329 coins." })
    expect(addScore).toHaveBeenCalledWith(roomId, userId, "coin", 329, "stored-artifact:retrieve", {
      intent: "exact",
    })
  })

  test("round-trips stack metadata on item delivery", async () => {
    const artifact = legacyItem({
      contents: [
        {
          id: "c1",
          kind: "item",
          itemDefinitionId: "item-shops:mars-egg",
          itemName: "Mars Egg",
          itemQuantity: 1,
          metadata: { condition: "poor" },
        },
      ],
      containerDefinitionId: "item-shops:van-cubby",
    })
    const { context, giveItem } = makeContext({ artifact })
    await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: artifact.id,
      password: "eggsonmars",
    })
    expect(giveItem).toHaveBeenNthCalledWith(
      1,
      roomId,
      userId,
      "item-shops:mars-egg",
      1,
      { condition: "poor" },
      "plugin",
    )
    expect(giveItem).toHaveBeenNthCalledWith(
      2,
      roomId,
      userId,
      "item-shops:van-cubby",
      1,
      undefined,
      "plugin",
    )
  })

  test("partial withdrawal leaves the stash and does not return the container", async () => {
    const artifact = legacyItem({
      contents: [
        {
          id: "a",
          kind: "item",
          itemDefinitionId: "item-shops:mars-egg",
          itemName: "Mars Egg",
          itemQuantity: 1,
        },
        {
          id: "b",
          kind: "item",
          itemDefinitionId: "item-shops:mars-egg",
          itemName: "Mars Egg",
          itemQuantity: 1,
        },
      ],
      containerDefinitionId: "item-shops:van-cubby",
    })
    const { context, remove, update, giveItem } = makeContext({ artifact })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: artifact.id,
      password: "eggsonmars",
      contentIds: ["a"],
    })
    expect(result.success).toBe(true)
    expect(remove).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalled()
    expect(giveItem).toHaveBeenCalledTimes(1)
  })

  function roadCase(contents: StoredArtifact["contents"]): StoredArtifact {
    return legacyItem({
      storingItemId: "road-case",
      artifactType: "item",
      itemDefinitionId: undefined,
      itemName: undefined,
      itemQuantity: undefined,
      contents,
      containerDefinitionId: "item-shops:road-case",
    })
  }

  const egg = (id: string) => ({
    id,
    kind: "item" as const,
    itemDefinitionId: "item-shops:mars-egg",
    itemName: "Mars Egg",
    itemQuantity: 1,
  })

  test("taking every item leaves an empty stash when the container has no slot", async () => {
    const artifact = roadCase([egg("a"), egg("b"), egg("c")])
    const { context, giveItem, remove, update } = makeContext({ artifact })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: artifact.id,
      password: "eggsonmars",
      contentIds: ["a", "b", "c"],
    })
    expect(result.success).toBe(true)
    expect(giveItem).toHaveBeenCalledTimes(3)
    expect(remove).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(artifact.id, { contents: [] })
  })

  test("an empty stash hands back the container and drops the row", async () => {
    const artifact = roadCase([])
    const { context, giveItem, remove, update } = makeContext({ artifact })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: artifact.id,
      password: "eggsonmars",
      contentIds: [],
    })
    expect(result).toEqual({
      success: true,
      message: "The empty Road Case is back in your bag.",
    })
    expect(giveItem).toHaveBeenCalledWith(
      roomId,
      userId,
      "item-shops:road-case",
      1,
      undefined,
      "plugin",
    )
    expect(giveItem).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(artifact.id)
    expect(postSystemChatMessage).toHaveBeenCalledWith({
      context,
      roomId,
      content: "Ross picked up the empty Road Case from storage.",
    })
  })

  test("claiming an empty stash with a full bag fails and keeps the row", async () => {
    const artifact = roadCase([])
    const { context, giveItem, remove, update } = makeContext({
      artifact,
      inventoryItems: [
        { itemId: "i1", definitionId: "item-shops:mars-egg", quantity: 1 },
        { itemId: "i2", definitionId: "item-shops:mars-egg", quantity: 1 },
        { itemId: "i3", definitionId: "item-shops:mars-egg", quantity: 1 },
      ],
    })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: artifact.id,
      password: "eggsonmars",
      contentIds: [],
    })
    expect(result).toEqual({
      success: false,
      message: "Inventory is full — make space and try again.",
    })
    expect(giveItem).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  test("posts wrong-password chat after releasing the lock", async () => {
    const { context, artifacts } = makeContext()
    artifacts.attemptRetrieve.mockResolvedValue({ status: "wrong_password" })
    let chatDuringLock = 0
    artifacts.withArtifactLock.mockImplementation(async (_id: string, fn: () => Promise<unknown>) => {
      const result = await fn()
      chatDuringLock = vi.mocked(postSystemChatMessage).mock.calls.length
      return result
    })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "3448e696-d86a-46ab-a18a-d61dba076718",
      password: "nope",
    })
    expect(result).toEqual({ success: false, message: "Wrong password." })
    expect(chatDuringLock).toBe(0)
    expect(postSystemChatMessage).toHaveBeenCalledWith({
      context,
      roomId,
      content: "Ross failed to retrieve an artifact from storage (wrong password).",
    })
  })

  test("posts success chat after the artifact lock is released", async () => {
    const { context, artifacts } = makeContext()
    let chatDuringLock = 0
    artifacts.withArtifactLock.mockImplementation(async (_id: string, fn: () => Promise<unknown>) => {
      const result = await fn()
      chatDuringLock = vi.mocked(postSystemChatMessage).mock.calls.length
      return result
    })
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "3448e696-d86a-46ab-a18a-d61dba076718",
      password: "eggsonmars",
    })
    expect(result.success).toBe(true)
    expect(chatDuringLock).toBe(0)
    expect(postSystemChatMessage).toHaveBeenCalledTimes(1)
  })

  test("does not post chat when the artifact lock cannot be acquired", async () => {
    const { context, artifacts } = makeContext()
    artifacts.withArtifactLock.mockRejectedValue(new Error("could not acquire artifact lock"))
    const result = await retrieveStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "3448e696-d86a-46ab-a18a-d61dba076718",
      password: "eggsonmars",
    })
    expect(result).toEqual({ success: false, message: "That stash is busy. Try again." })
    expect(postSystemChatMessage).not.toHaveBeenCalled()
  })
})
