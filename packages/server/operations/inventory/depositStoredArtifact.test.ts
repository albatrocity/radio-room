import { describe, expect, test, vi } from "vitest"
import type { AppContext, InventoryItem, StoredArtifact } from "@repo/types"
import { depositStoredArtifact } from "./depositStoredArtifact"

vi.mock("./transferEvents", () => ({
  displayName: async () => "Ross",
}))
vi.mock("../polls/postSystemChatMessage", () => ({
  postSystemChatMessage: vi.fn().mockResolvedValue(undefined),
}))

const roomId = "room1"
const userId = "u1"

const trailerStash: StoredArtifact = {
  id: "stash-1",
  storingPlugin: "item-shops",
  storingItemId: "trailer",
  artifactType: "item",
  contents: [
    {
      id: "c1",
      kind: "item",
      itemDefinitionId: "item-shops:boost-pedal",
      itemName: "Boost Pedal",
      itemQuantity: 1,
    },
  ],
  containerDefinitionId: "item-shops:trailer",
  storedAt: 1,
  storedByUserId: "x",
  storedByUsername: "Ross",
  password: "secret",
}

const pedalStack: InventoryItem = {
  itemId: "inv-pedal",
  definitionId: "item-shops:boost-pedal",
  sourcePlugin: "item-shops",
  quantity: 1,
  acquiredAt: 1,
  metadata: { condition: "poor" },
}

function makeContext() {
  const update = vi.fn().mockImplementation(async (_id: string, patch: unknown) => ({
    ...trailerStash,
    ...(patch as object),
  }))
  const removeItem = vi.fn().mockResolvedValue(true)
  const giveItem = vi.fn().mockResolvedValue({ itemId: "refund" })
  const addScore = vi.fn().mockResolvedValue(0)
  const artifacts = {
    withArtifactLock: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    attemptRetrieve: vi.fn().mockResolvedValue({ status: "success", artifact: trailerStash }),
    update,
  }
  const inventory = {
    getInventory: vi.fn().mockResolvedValue({
      userId,
      items: [pedalStack],
      maxSlots: 3,
      maxCollectionSlots: 12,
      maxPlaybackSlots: 2,
    }),
    getItemDefinition: vi.fn().mockImplementation(async (_room: string, id: string) => {
      if (id === "item-shops:trailer") {
        return { id, name: "Trailer", storageCapacity: 5 }
      }
      if (id === "item-shops:boost-pedal") {
        return { id, name: "Boost Pedal" }
      }
      return { id, name: id }
    }),
    removeItem,
    giveItem,
  }
  const context = {
    artifacts,
    inventory,
    gameSessions: { addScore, getUserState: vi.fn().mockResolvedValue({ attributes: { coin: 50 } }) },
  } as unknown as AppContext
  return { context, update, removeItem, addScore }
}

describe("depositStoredArtifact", () => {
  test("moves an inventory stack (with metadata) into the stash", async () => {
    const { context, update, removeItem } = makeContext()
    const result = await depositStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "stash-1",
      password: "secret",
      targetInventoryItemIds: ["inv-pedal"],
    })
    expect(result.success).toBe(true)
    expect(removeItem).toHaveBeenCalledWith(roomId, userId, "inv-pedal", 1)
    expect(update).toHaveBeenCalledWith(
      "stash-1",
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            itemDefinitionId: "item-shops:boost-pedal",
            metadata: { condition: "poor" },
          }),
        ]),
      }),
    )
  })

  test("does not rewrite name or note on deposit", async () => {
    const { context, update } = makeContext()
    const result = await depositStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "stash-1",
      password: "secret",
      targetInventoryItemIds: ["inv-pedal"],
    })
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith(
      "stash-1",
      expect.not.objectContaining({ label: expect.anything(), note: expect.anything() }),
    )
  })

  test("rejects a deposit with nothing to add", async () => {
    const { context, update } = makeContext()
    const result = await depositStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "stash-1",
      password: "secret",
    })
    expect(result).toEqual({
      success: false,
      message: "Nothing to add.",
    })
    expect(update).not.toHaveBeenCalled()
  })

  test("debits coins with intent exact", async () => {
    const { context, addScore } = makeContext()
    const result = await depositStoredArtifact({
      context,
      roomId,
      userId,
      artifactId: "stash-1",
      password: "secret",
      coinAmount: 20,
    })
    expect(result.success).toBe(true)
    expect(addScore).toHaveBeenCalledWith(roomId, userId, "coin", -20, "stored-artifact:deposit", {
      intent: "exact",
    })
  })
})
