import { describe, expect, test, vi } from "vitest"
import type { InventoryItem, ItemDefinition, PhysicalMediaFormat } from "@repo/types"
import { PHYSICAL_MEDIA_CONDITION_KEY, PHYSICAL_MEDIA_ORIGIN_KEY } from "@repo/types"
import { userFactory } from "@repo/factories"
import { dustyRecordTransitionMessage } from "../dusty-record"
import { scratchedCdTransitionMessage } from "../scratched-cd"
import { albumTitleFromItemName, RESTORE_TOAST_DURATION_MS } from "../shared/restoreMedia"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"
import { describeRestoreMediaItem } from "../shared/restoreMedia.testSupport"
import { pencil, pencilDegradeBrokenToast, pencilDegradeIntactToast } from "./index"

const PENCIL_RESTORE_BODY = (albumTitle: string) =>
  `You used the pencil to respool the tape and brought ${albumTitle} back to life.`

describe("pencil", () => {
  test("registers as a mediaItem restorer", () => {
    expect(pencil.shortId).toBe("pencil")
    expect(pencil.catalogEntry.definition.requiresTarget).toBe("mediaItem")
    expect(pencil.catalogEntry.definition.icon).toBe("Pencil")
    expect(pencil.catalogEntry.definition.coinValue).toBe(25)
  })
})

describeRestoreMediaItem({
  item: pencil,
  itemLabel: "Pencil",
  successBody: PENCIL_RESTORE_BODY,
  matchingRecords: [{ format: "TAPE", name: "Mix Tape", shortId: "pm-mix" }],
  brokenShortId: "tangled-tape",
  brokenName: "Tangled Tape",
})

function pmDef(opts: {
  shortId: string
  name: string
  format: PhysicalMediaFormat
}): ItemDefinition {
  const frame =
    opts.format === "CD"
      ? "jewel-case"
      : opts.format === "LP"
        ? "record-jacket"
        : opts.format === "45"
          ? "die-cut-jacket"
          : "cassette-case"
  return createMockDefinition(opts.shortId, {
    id: `item-shops:${opts.shortId}`,
    name: opts.name,
    mediaFormat: opts.format,
    artworkFrame: frame,
    slotPool: "collection",
    stackable: false,
    maxStack: 1,
    consumable: false,
  })
}

function stack(def: ItemDefinition, overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: overrides?.itemId ?? `stack-${def.shortId}`,
    definitionId: def.id,
    sourcePlugin: def.sourcePlugin,
    quantity: overrides?.quantity ?? 1,
    acquiredAt: Date.now(),
    metadata: overrides?.metadata,
    ...overrides,
  }
}

const DEGRADE_CASES: Array<{
  format: PhysicalMediaFormat
  name: string
  shortId: string
  brokenShortId: string
  brokenTitle: (recordName: string) => string
}> = [
  {
    format: "CD",
    name: "CD: Kid A",
    shortId: "pm-kid-a",
    brokenShortId: "scratched-cd",
    brokenTitle: scratchedCdTransitionMessage,
  },
  {
    format: "LP",
    name: "LP: Loveless",
    shortId: "pm-loveless",
    brokenShortId: "dusty-record",
    brokenTitle: dustyRecordTransitionMessage,
  },
  {
    format: "45",
    name: "45: Come as You Are",
    shortId: "pm-come-as",
    brokenShortId: "dusty-record",
    brokenTitle: dustyRecordTransitionMessage,
  },
]

describe("pencil degrades discs and vinyl", () => {
  const actorId = "u-pencil"
  const pencilDef = createMockDefinition("pencil", {
    name: "Pencil",
    requiresTarget: "mediaItem",
  })

  function setupFor(def: ItemDefinition, target: InventoryItem) {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: actorId })
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: actorId,
      items: [target],
      maxSlots: 20,
      maxCollectionSlots: 20,
      maxPlaybackSlots: 20,
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) => {
      return id === def.id ? def : null
    })
    vi.mocked(deps.context.inventory.updateItemMetadata).mockResolvedValue(target)
    vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(
      stack(createMockDefinition("broken", { id: "item-shops:broken", name: "Broken" }), {
        itemId: "broken-given",
      }),
    )
    return { deps, actor }
  }

  for (const row of DEGRADE_CASES) {
    const def = pmDef({ shortId: row.shortId, name: row.name, format: row.format })

    test(`${row.format} Mint → Good`, async () => {
      const target = stack(def, {
        itemId: `pm-mint-${row.format}`,
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "mint" },
      })
      const { deps, actor } = setupFor(def, target)
      const result = await invokeUse(pencil, deps, actor.userId, pencilDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result).toEqual({
        success: true,
        consumed: true,
        toastType: "warning",
        ...pencilDegradeIntactToast({
          albumTitle: albumTitleFromItemName(row.name),
          condition: "good",
          format: row.format,
        }),
      })
      expect(deps.context.inventory.updateItemMetadata).toHaveBeenCalledWith(
        actor.userId,
        target.itemId,
        { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
      )
      expect(deps.context.inventory.removeItem).not.toHaveBeenCalled()
    })

    test(`${row.format} Good → Poor`, async () => {
      const target = stack(def, {
        itemId: `pm-good-${row.format}`,
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
      })
      const { deps, actor } = setupFor(def, target)
      const result = await invokeUse(pencil, deps, actor.userId, pencilDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result).toEqual({
        success: true,
        consumed: true,
        toastType: "warning",
        ...pencilDegradeIntactToast({
          albumTitle: albumTitleFromItemName(row.name),
          condition: "poor",
          format: row.format,
        }),
      })
      expect(deps.context.inventory.updateItemMetadata).toHaveBeenCalledWith(
        actor.userId,
        target.itemId,
        { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
      )
    })

    test(`${row.format} Poor → broken SKU`, async () => {
      const target = stack(def, {
        itemId: `pm-poor-${row.format}`,
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
      })
      const { deps, actor } = setupFor(def, target)
      const result = await invokeUse(pencil, deps, actor.userId, pencilDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result).toEqual({
        success: true,
        consumed: true,
        toastType: "warning",
        title: row.brokenTitle(row.name),
        message: pencilDegradeBrokenToast({ recordName: row.name, format: row.format }).message,
        duration: RESTORE_TOAST_DURATION_MS,
      })
      expect(deps.context.inventory.updateItemMetadata).not.toHaveBeenCalled()
      expect(deps.context.inventory.removeItem).toHaveBeenCalledWith(
        actor.userId,
        target.itemId,
        1,
        {
          degraded: true,
        },
      )
      expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(
        actor.userId,
        `item-shops:${row.brokenShortId}`,
        1,
        { [PHYSICAL_MEDIA_ORIGIN_KEY]: def.id },
        "plugin",
        expect.objectContaining({
          userId: actorId,
          items: [],
        }),
      )
    })
  }

  test("Poor convert still succeeds when inventory cannot keep the broken copy", async () => {
    const def = pmDef({ shortId: "pm-kid-a", name: "CD: Kid A", format: "CD" })
    const target = stack(def, {
      itemId: "pm-poor-full",
      metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
    })
    const { deps, actor } = setupFor(def, target)
    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(null)

    const result = await invokeUse(pencil, deps, actor.userId, pencilDef, {
      targetInventoryItemId: target.itemId,
    })

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(result.title).toBe(scratchedCdTransitionMessage("CD: Kid A"))
    expect(result.toastType).toBe("warning")
    expect(deps.context.inventory.removeItem).toHaveBeenCalledWith(actor.userId, target.itemId, 1, {
      degraded: true,
    })
  })
})
