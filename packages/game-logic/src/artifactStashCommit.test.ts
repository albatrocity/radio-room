import { describe, expect, it, vi } from "vitest"
import type { ArtifactContent, StoredArtifact } from "@repo/types"
import {
  STASH_LABEL_TOO_LONG_MESSAGE,
  applyArtifactStoreWrite,
  applyArtifactUpdateWrite,
  artifactKindBadge,
  emptyStashLine,
} from "./artifactStash"
import {
  applyDepositMutations,
  applyWithdrawalDeliveries,
  withdrawalPersistAction,
} from "./artifactStashCommit"

const base: StoredArtifact = {
  id: "stash-1",
  storingPlugin: "item-shops",
  storingItemId: "road-case",
  artifactType: "item",
  contents: [
    {
      id: "c1",
      kind: "item",
      itemDefinitionId: "item-shops:mars-egg",
      itemName: "Mars Egg",
      itemQuantity: 1,
    },
  ],
  containerDefinitionId: "item-shops:road-case",
  storedAt: 10,
  storedByUserId: "u1",
  storedByUsername: "Ross",
  password: "secret",
}

describe("applyArtifactStoreWrite", () => {
  it("stamps lastTouchedAt and rejects an over-cap label", () => {
    const written = applyArtifactStoreWrite(base, () => "new-id", 99)
    expect(written.lastTouchedAt).toBe(99)
    expect(written.contents?.length).toBe(1)

    expect(() =>
      applyArtifactStoreWrite(
        { ...base, label: "x".repeat(33) },
        () => "id",
        99,
      ),
    ).toThrow(STASH_LABEL_TOO_LONG_MESSAGE)
  })
})

describe("applyArtifactUpdateWrite", () => {
  it("stamps lastTouchedAt and ignores lastTouchedAt on the patch", () => {
    const next = applyArtifactUpdateWrite(
      base,
      { contents: [], lastTouchedAt: 1 } as never,
      () => "id",
      50,
    )
    expect(next.lastTouchedAt).toBe(50)
    expect(next.contents).toEqual([])
  })
})

describe("artifactKindBadge / emptyStashLine", () => {
  it("classifies mixed, empty, and named empty containers", () => {
    expect(artifactKindBadge([])).toBe("Empty")
    expect(
      artifactKindBadge([
        { id: "a", kind: "coin", coinValue: 5 },
        { id: "b", kind: "item", itemDefinitionId: "x", itemName: "X", itemQuantity: 1 },
      ]),
    ).toBe("Mixed")
    expect(emptyStashLine("Road Case")).toBe("Road Case is empty.")
    expect(emptyStashLine(null)).toBe("This stash is empty.")
  })
})

describe("withdrawalPersistAction", () => {
  it("keeps an emptied reusable stash as contents: []", () => {
    expect(
      withdrawalPersistAction({ remainder: [] }, "item-shops:road-case"),
    ).toEqual({ type: "update", contents: [] })
  })

  it("removes when the container is returned or the row is legacy", () => {
    expect(
      withdrawalPersistAction({ remainder: [], container: { definitionId: "item-shops:road-case" } }),
    ).toEqual({ type: "remove" })
    expect(withdrawalPersistAction({ remainder: [] })).toEqual({ type: "remove" })
  })
})

describe("applyWithdrawalDeliveries", () => {
  it("rolls back earlier credits when a later giveItem fails", async () => {
    const addCoins = vi.fn().mockResolvedValue(undefined)
    const giveItem = vi
      .fn()
      .mockResolvedValueOnce({ itemId: "given-1" })
      .mockResolvedValueOnce(null)
    const removeItem = vi.fn().mockResolvedValue(true)
    const pedal: ArtifactContent = {
      id: "p",
      kind: "item",
      itemDefinitionId: "item-shops:boost-pedal",
      itemName: "Boost Pedal",
      itemQuantity: 1,
    }
    const result = await applyWithdrawalDeliveries({
      deliveries: [pedal],
      container: { definitionId: "item-shops:road-case" },
      ports: { addCoins, giveItem, removeItem },
    })
    expect(result).toEqual({ ok: false, code: "give_failed" })
    expect(removeItem).toHaveBeenCalledWith("given-1", 1)
    expect(addCoins).not.toHaveBeenCalled()
  })
})

describe("applyDepositMutations", () => {
  it("restores items when update fails, and does not credit coins that were never debited", async () => {
    const removeItem = vi.fn().mockResolvedValue(true)
    const giveItem = vi.fn().mockResolvedValue({ itemId: "refund" })
    const debitCoins = vi.fn().mockResolvedValue(undefined)
    const creditCoins = vi.fn().mockResolvedValue(undefined)
    const updateArtifact = vi.fn().mockResolvedValue(null)
    const result = await applyDepositMutations({
      stacks: [
        { itemId: "inv-1", definitionId: "item-shops:boost-pedal", quantity: 1, metadata: { x: 1 } },
      ],
      coinAmount: 5,
      nextContents: [],
      ports: { removeItem, giveItem, debitCoins, creditCoins, updateArtifact },
    })
    expect(result).toEqual({ ok: false, message: "Could not add to the stash." })
    expect(giveItem).toHaveBeenCalledWith("item-shops:boost-pedal", 1, { x: 1 })
    expect(debitCoins).toHaveBeenCalledWith(5)
    expect(creditCoins).toHaveBeenCalledWith(5)
  })

  it("does not credit coins when a remove fails before debit", async () => {
    const removeItem = vi.fn().mockResolvedValue(false)
    const giveItem = vi.fn()
    const debitCoins = vi.fn()
    const creditCoins = vi.fn()
    const updateArtifact = vi.fn()
    const result = await applyDepositMutations({
      stacks: [{ itemId: "inv-1", definitionId: "item-shops:boost-pedal", quantity: 1 }],
      coinAmount: 5,
      nextContents: [],
      ports: { removeItem, giveItem, debitCoins, creditCoins, updateArtifact },
    })
    expect(result.ok).toBe(false)
    expect(debitCoins).not.toHaveBeenCalled()
    expect(creditCoins).not.toHaveBeenCalled()
  })
})
