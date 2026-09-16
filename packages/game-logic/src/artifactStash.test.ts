import { describe, expect, it } from "vitest"
import type { ArtifactContent, StoredArtifact } from "@repo/types"
import {
  artifactLastTouchedAt,
  artifactSummaryLabel,
  computeFreeSlotsByPool,
  normalizeArtifactPayload,
  planDeposit,
  planWithdrawal,
  readArtifactContents,
  sanitizeStashLabel,
  sanitizeStashNote,
  summarizeWithdrawal,
  hydrateStoredArtifactContainers,
  remainingStashSlots,
  selectFittingContentIds,
} from "./artifactStash"

/** Production dump 2026-09-16, passwords redacted. */
const LEGACY_COIN = {
  id: "b3befc05-edaf-4717-92ed-8e8e65ea164b",
  storingPlugin: "item-shops",
  storingItemId: "merch-cash-box",
  artifactType: "coin" as const,
  coinValue: 329,
  storedAt: 1787285749770,
  storedByUserId: "9dc9fc5070e9ded896c4bf5a959cc039",
  storedByUsername: "Stick",
} satisfies Pick<
  StoredArtifact,
  | "id"
  | "storingPlugin"
  | "storingItemId"
  | "artifactType"
  | "coinValue"
  | "storedAt"
  | "storedByUserId"
  | "storedByUsername"
>

const LEGACY_ITEM = {
  id: "3448e696-d86a-46ab-a18a-d61dba076718",
  storingPlugin: "item-shops",
  storingItemId: "van-cubby",
  artifactType: "item" as const,
  itemDefinitionId: "item-shops:mars-egg",
  itemName: "Mars Egg",
  itemQuantity: 1,
  storedAt: 1779419753246,
  storedByUserId: "1243633676",
  storedByUsername: "Ross",
} satisfies Pick<
  StoredArtifact,
  | "id"
  | "storingPlugin"
  | "storingItemId"
  | "artifactType"
  | "itemDefinitionId"
  | "itemName"
  | "itemQuantity"
  | "storedAt"
  | "storedByUserId"
  | "storedByUsername"
>

function seqIds() {
  let n = 0
  return () => `id-${++n}`
}

const pedal: ArtifactContent = {
  id: "c-pedal",
  kind: "item",
  itemDefinitionId: "item-shops:boost-pedal",
  itemName: "Boost Pedal",
  itemQuantity: 1,
}

const coins120: ArtifactContent = {
  id: "c-coins",
  kind: "coin",
  coinValue: 120,
}

const record: ArtifactContent = {
  id: "c-record",
  kind: "item",
  itemDefinitionId: "item-shops:local-album",
  itemName: "Kid A",
  itemQuantity: 1,
}

const defs = {
  "item-shops:boost-pedal": { id: "item-shops:boost-pedal", slotPool: "inventory" as const },
  "item-shops:local-album": { id: "item-shops:local-album", slotPool: "collection" as const },
  "item-shops:van-cubby": { id: "item-shops:van-cubby", slotPool: "inventory" as const },
  "item-shops:road-case": { id: "item-shops:road-case", slotPool: "inventory" as const },
  "item-shops:trailer": { id: "item-shops:trailer", slotPool: "inventory" as const },
}

describe("production compatibility (A1a)", () => {
  it("reads the live coin row through the shim", () => {
    const contents = readArtifactContents(LEGACY_COIN)
    expect(contents).toEqual([
      { id: "legacy:b3befc05-edaf-4717-92ed-8e8e65ea164b:coin", kind: "coin", coinValue: 329 },
    ])
    expect(artifactSummaryLabel(contents)).toBe("329 coins")
  })

  it("reads the live item row through the shim", () => {
    const contents = readArtifactContents(LEGACY_ITEM)
    expect(contents).toEqual([
      {
        id: "legacy:3448e696-d86a-46ab-a18a-d61dba076718:item",
        kind: "item",
        itemDefinitionId: "item-shops:mars-egg",
        itemName: "Mars Egg",
        itemQuantity: 1,
      },
    ])
    expect(artifactSummaryLabel(contents)).toBe("Mars Egg")
  })

  it("treats absent label, note, and containerDefinitionId as valid", () => {
    expect(LEGACY_COIN).not.toHaveProperty("contents")
    expect(LEGACY_COIN).not.toHaveProperty("label")
    expect(LEGACY_COIN).not.toHaveProperty("note")
    expect(LEGACY_COIN).not.toHaveProperty("containerDefinitionId")
    expect(LEGACY_ITEM).not.toHaveProperty("containerDefinitionId")
  })

  it("fully withdraws a legacy stash and returns no container", () => {
    const contents = readArtifactContents(LEGACY_ITEM)
    const plan = planWithdrawal({
      contents,
      containerDefinitionId: undefined,
      freeSlotsByPool: { inventory: 3, collection: 12, playback: 2 },
      definitionsById: {
        "item-shops:mars-egg": { id: "item-shops:mars-egg", slotPool: "inventory" },
      },
    })
    expect(plan.deliveries).toEqual(contents)
    expect(plan.remainder).toEqual([])
    expect(plan.container).toBeUndefined()
    expect(plan.rejected).toEqual([])
  })

  it("writes the v1 shadow when contents.length === 1", () => {
    const coin = normalizeArtifactPayload([{ kind: "coin", coinValue: 329 }], seqIds())
    expect(coin.artifactType).toBe("coin")
    expect(coin.coinValue).toBe(329)
    expect(coin.itemDefinitionId).toBeUndefined()

    const item = normalizeArtifactPayload(
      [
        {
          kind: "item",
          itemDefinitionId: "item-shops:mars-egg",
          itemName: "Mars Egg",
          itemQuantity: 1,
        },
      ],
      seqIds(),
    )
    expect(item.artifactType).toBe("item")
    expect(item.itemDefinitionId).toBe("item-shops:mars-egg")
    expect(item.itemName).toBe("Mars Egg")
    expect(item.itemQuantity).toBe(1)
    expect(item.coinValue).toBeUndefined()
  })

  it("does not write v1 shadow fields for multi-content rows", () => {
    const multi = normalizeArtifactPayload(
      [
        { kind: "item", itemDefinitionId: "a", itemName: "A", itemQuantity: 1 },
        { kind: "coin", coinValue: 10 },
      ],
      seqIds(),
    )
    expect(multi.artifactType).toBe("item")
    expect(multi.coinValue).toBeUndefined()
    expect(multi.itemDefinitionId).toBeUndefined()
    expect(multi.contents).toHaveLength(2)
    expect(multi.contents[0]?.id).toBe("id-1")
  })
})

describe("readArtifactContents garbage", () => {
  it("returns [] for an empty object", () => {
    expect(readArtifactContents({ id: "x", artifactType: "item" })).toEqual([])
  })

  it("treats an explicit empty array as an emptied v2 stash", () => {
    const row = { ...LEGACY_COIN, contents: [] as ArtifactContent[] }
    expect(readArtifactContents(row)).toEqual([])
  })

  it("falls through to the v1 shim when every content row is unreadable", () => {
    const row = { ...LEGACY_COIN, contents: [{ kind: "coin" }] as unknown as ArtifactContent[] }
    expect(readArtifactContents(row)[0]).toMatchObject({ kind: "coin", coinValue: 329 })
  })
})

describe("artifactSummaryLabel", () => {
  it("formats stacked items and mixed stashes", () => {
    expect(
      artifactSummaryLabel([
        { id: "1", kind: "item", itemDefinitionId: "p", itemName: "Boost Pedal", itemQuantity: 2 },
      ]),
    ).toBe("Boost Pedal ×2")
    expect(artifactSummaryLabel([pedal, pedal, pedal, coins120])).toBe("3 items + 120 coins")
  })
})

describe("sanitizeStashLabel / sanitizeStashNote", () => {
  it("strips control characters, collapses whitespace, and trims", () => {
    expect(sanitizeStashLabel("  hello\n\tworld\u0007  ")).toEqual({
      status: "ok",
      value: "hello world",
    })
  })

  it("treats empty-after-trim as absent, not empty string", () => {
    expect(sanitizeStashLabel("   ")).toEqual({ status: "absent" })
    expect(sanitizeStashNote("\n\t")).toEqual({ status: "absent" })
    expect(sanitizeStashLabel(undefined)).toEqual({ status: "absent" })
  })

  it("rejects rather than truncating over-cap text", () => {
    expect(sanitizeStashLabel("a".repeat(33))).toEqual({ status: "too_long" })
    expect(sanitizeStashNote("n".repeat(200))).toEqual({ status: "too_long" })
    expect(sanitizeStashLabel("a".repeat(32))).toEqual({ status: "ok", value: "a".repeat(32) })
    expect(sanitizeStashNote("n".repeat(140))).toEqual({ status: "ok", value: "n".repeat(140) })
  })
})

describe("planWithdrawal", () => {
  it("rejects a selection that exceeds per-pool free slots", () => {
    const plan = planWithdrawal({
      contents: [pedal, { ...pedal, id: "c-pedal-2" }, { ...pedal, id: "c-pedal-3" }],
      selectedIds: ["c-pedal", "c-pedal-2", "c-pedal-3"],
      freeSlotsByPool: { inventory: 2, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(plan.deliveries).toEqual([])
    expect(plan.rejected).toHaveLength(3)
  })

  it("allows mixed pools when inventory is full but collection is not", () => {
    const plan = planWithdrawal({
      contents: [pedal, record],
      selectedIds: ["c-record"],
      freeSlotsByPool: { inventory: 0, collection: 4, playback: 2 },
      definitionsById: defs,
    })
    expect(plan.deliveries).toEqual([record])
    expect(plan.remainder).toEqual([pedal])
    expect(plan.rejected).toEqual([])
  })

  it("reserves a container slot only when the selection empties the stash", () => {
    const fullTake = planWithdrawal({
      contents: [pedal, { ...pedal, id: "c-pedal-2" }],
      selectedIds: ["c-pedal", "c-pedal-2"],
      containerDefinitionId: "item-shops:trailer",
      freeSlotsByPool: { inventory: 3, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(fullTake.container).toEqual({ definitionId: "item-shops:trailer" })
    expect(fullTake.containerBlocked).toBe(false)
    expect(fullTake.rejected).toEqual([])

    const partial = planWithdrawal({
      contents: [pedal, { ...pedal, id: "c-pedal-2" }],
      selectedIds: ["c-pedal"],
      containerDefinitionId: "item-shops:trailer",
      freeSlotsByPool: { inventory: 1, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(partial.container).toBeUndefined()
    expect(partial.deliveries).toHaveLength(1)
    expect(partial.remainder).toHaveLength(1)
  })

  it("empties the stash without the container when the container has no slot", () => {
    const plan = planWithdrawal({
      contents: [pedal, { ...pedal, id: "c-pedal-2" }, { ...pedal, id: "c-pedal-3" }],
      selectedIds: ["c-pedal", "c-pedal-2", "c-pedal-3"],
      containerDefinitionId: "item-shops:trailer",
      freeSlotsByPool: { inventory: 3, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(plan.deliveries).toHaveLength(3)
    expect(plan.remainder).toEqual([])
    expect(plan.container).toBeUndefined()
    expect(plan.containerBlocked).toBe(true)
    expect(plan.rejected).toEqual([])
  })

  it("still rejects when the deliveries alone overflow", () => {
    const plan = planWithdrawal({
      contents: [pedal, { ...pedal, id: "c-pedal-2" }, { ...pedal, id: "c-pedal-3" }],
      selectedIds: ["c-pedal", "c-pedal-2", "c-pedal-3"],
      containerDefinitionId: "item-shops:trailer",
      freeSlotsByPool: { inventory: 2, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(plan.deliveries).toEqual([])
    expect(plan.remainder).toHaveLength(3)
    expect(plan.rejected).toHaveLength(3)
    expect(plan.containerBlocked).toBe(false)
  })

  it("claims the container from an already-empty stash when a slot is free", () => {
    const plan = planWithdrawal({
      contents: [],
      selectedIds: [],
      containerDefinitionId: "item-shops:trailer",
      freeSlotsByPool: { inventory: 1, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(plan.deliveries).toEqual([])
    expect(plan.container).toEqual({ definitionId: "item-shops:trailer" })
    expect(plan.containerBlocked).toBe(false)
  })

  it("blocks the empty-stash claim when the container pool is full", () => {
    const plan = planWithdrawal({
      contents: [],
      selectedIds: [],
      containerDefinitionId: "item-shops:trailer",
      freeSlotsByPool: { inventory: 0, collection: 12, playback: 2 },
      definitionsById: defs,
    })
    expect(plan.container).toBeUndefined()
    expect(plan.containerBlocked).toBe(true)
    expect(plan.rejected).toEqual([])
  })

  it("never consumes a slot for coins", () => {
    const plan = planWithdrawal({
      contents: [coins120],
      freeSlotsByPool: { inventory: 0, collection: 0, playback: 0 },
      definitionsById: defs,
    })
    expect(plan.deliveries).toEqual([coins120])
    expect(plan.rejected).toEqual([])
  })
})

describe("planDeposit", () => {
  it("enforces remaining capacity", () => {
    const plan = planDeposit({
      contents: [pedal, pedal, pedal],
      capacity: 3,
      incoming: [{ kind: "item", itemDefinitionId: "x", itemName: "X", itemQuantity: 1 }],
    })
    expect(plan.nextContents).toHaveLength(3)
    expect(plan.rejected).toHaveLength(1)
  })

  it("merges coins into a single entry instead of accumulating rows", () => {
    const plan = planDeposit({
      contents: [coins120],
      capacity: 1,
      incoming: [{ kind: "coin", coinValue: 50 }],
    })
    expect(plan.nextContents).toEqual([{ ...coins120, coinValue: 170 }])
    expect(plan.rejected).toEqual([])
  })

  it("lets a coin entry occupy one of Trailer's five slots", () => {
    const plan = planDeposit({
      contents: [pedal, pedal, pedal],
      capacity: 5,
      incoming: [
        { kind: "item", itemDefinitionId: "a", itemName: "A", itemQuantity: 1 },
        { kind: "coin", coinValue: 10 },
        { kind: "item", itemDefinitionId: "b", itemName: "B", itemQuantity: 1 },
      ],
    })
    expect(plan.nextContents).toHaveLength(5)
    expect(plan.rejected).toHaveLength(1)
    expect(plan.rejected[0]).toMatchObject({ itemName: "B" })
  })
})

describe("summarizeWithdrawal copy", () => {
  it("keeps single-content withdrawal byte-identical to today's strings", () => {
    expect(
      summarizeWithdrawal({
        username: "Stick",
        deliveries: [{ id: "c", kind: "coin", coinValue: 329 }],
      }),
    ).toEqual({
      roomMessage: "Stick retrieved 329 coins from storage.",
      privateMessage: "Added 329 coins.",
    })
    expect(
      summarizeWithdrawal({
        username: "Ross",
        deliveries: [
          {
            id: "c",
            kind: "item",
            itemDefinitionId: "item-shops:mars-egg",
            itemName: "Mars Egg",
            itemQuantity: 1,
          },
        ],
      }),
    ).toEqual({
      roomMessage: "Ross retrieved Mars Egg from storage.",
      privateMessage: "Received Mars Egg.",
    })
  })

  it("uses the multi-content shape and appends the container-return clause", () => {
    expect(
      summarizeWithdrawal({
        username: "Ross",
        deliveries: [pedal, coins120],
        containerName: "Road Case",
        containerReturned: true,
      }),
    ).toEqual({
      roomMessage:
        "Ross took Boost Pedal and 120 coins from the Road Case and pocketed the empty Road Case.",
      privateMessage:
        "Received Boost Pedal and 120 coins. The empty Road Case is back in your bag.",
    })
  })

  it("describes claiming the container from an already-empty stash", () => {
    expect(
      summarizeWithdrawal({
        username: "Ross",
        deliveries: [],
        containerName: "Road Case",
        containerReturned: true,
      }),
    ).toEqual({
      roomMessage: "Ross picked up the empty Road Case from storage.",
      privateMessage: "The empty Road Case is back in your bag.",
    })
  })
})

describe("selectFittingContentIds", () => {
  it("takes coins plus as many items as each pool can hold, in list order", () => {
    expect(
      selectFittingContentIds(
        [pedal, { ...pedal, id: "c-pedal-2" }, coins120, record],
        { inventory: 1, collection: 12, playback: 2 },
        defs,
      ),
    ).toEqual(["c-pedal", "c-coins", "c-record"])
  })

  it("does not reserve a slot for the container", () => {
    expect(
      selectFittingContentIds(
        [pedal, { ...pedal, id: "c-pedal-2" }, { ...pedal, id: "c-pedal-3" }],
        { inventory: 3, collection: 12, playback: 2 },
        defs,
      ),
    ).toHaveLength(3)
  })

  it("selects coins even with every pool full", () => {
    expect(
      selectFittingContentIds(
        [pedal, coins120],
        { inventory: 0, collection: 0, playback: 0 },
        defs,
      ),
    ).toEqual(["c-coins"])
  })
})

describe("artifactLastTouchedAt", () => {
  it("falls back to storedAt on rows written before the field existed", () => {
    expect(artifactLastTouchedAt(LEGACY_COIN)).toBe(LEGACY_COIN.storedAt)
    expect(artifactLastTouchedAt({ storedAt: 10, lastTouchedAt: undefined })).toBe(10)
  })

  it("uses the stamp once a deposit or withdraw has moved it", () => {
    expect(artifactLastTouchedAt({ storedAt: 10, lastTouchedAt: 99 })).toBe(99)
  })

  it("never reports a touch older than creation, or a garbage stamp", () => {
    expect(artifactLastTouchedAt({ storedAt: 10, lastTouchedAt: 5 })).toBe(10)
    expect(artifactLastTouchedAt({ storedAt: 10, lastTouchedAt: 0 })).toBe(10)
    expect(artifactLastTouchedAt({ storedAt: 10, lastTouchedAt: Number.NaN })).toBe(10)
  })
})

describe("remainingStashSlots", () => {
  it("does not treat occupied length as the cap when capacity is unknown", () => {
    expect(remainingStashSlots(2, undefined)).toBeUndefined()
    expect(remainingStashSlots(2, 3)).toBe(1)
    expect(remainingStashSlots(3, 3)).toBe(0)
  })
})

describe("hydrateStoredArtifactContainers", () => {
  it("copies catalog capacity and name onto matching container ids", () => {
    const [hydrated] = hydrateStoredArtifactContainers(
      [{ id: "a", containerDefinitionId: "item-shops:road-case" }],
      { "item-shops:road-case": { storageCapacity: 3, name: "Road Case" } },
    )
    expect(hydrated?.storageCapacity).toBe(3)
    expect(hydrated?.containerName).toBe("Road Case")
  })

  it("leaves legacy rows without a container id alone", () => {
    const legacyRows: { id: string; containerDefinitionId?: string }[] = [{ id: "legacy" }]
    const [hydrated] = hydrateStoredArtifactContainers(legacyRows, {
      "item-shops:road-case": { storageCapacity: 3, name: "Road Case" },
    })
    expect(hydrated).toEqual({ id: "legacy" })
  })
})

describe("computeFreeSlotsByPool", () => {
  it("subtracts used slots from caps", () => {
    expect(
      computeFreeSlotsByPool(
        [{ definitionId: "item-shops:boost-pedal" }, { definitionId: "item-shops:local-album" }],
        { maxSlots: 3, maxCollectionSlots: 12, maxPlaybackSlots: 2 },
        defs,
      ),
    ).toEqual({ inventory: 2, collection: 11, playback: 2 })
  })
})
