import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import type { InventoryItem, ItemDefinition, PhysicalMediaFormat } from "@repo/types"
import { PHYSICAL_MEDIA_CONDITION_KEY, PHYSICAL_MEDIA_ORIGIN_KEY } from "@repo/types"
import type { Item } from "./types"
import { createMockDefinition, createMockDeps, invokeUse } from "./testHelpers"

type RestoreCaseOpts = {
  item: Item
  itemLabel: string
  matchingRecords: Array<{ format: PhysicalMediaFormat; name: string; shortId: string }>
  brokenShortId: string
  brokenName: string
  wrongFormat: PhysicalMediaFormat
}

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

export function describeRestoreMediaItem(opts: RestoreCaseOpts): void {
  const actorId = "u-restore"
  const matching = opts.matchingRecords.map((r) =>
    pmDef({ shortId: r.shortId, name: r.name, format: r.format }),
  )
  const primary = matching[0]
  if (!primary) throw new Error("describeRestoreMediaItem requires at least one matching record")

  const wrong = pmDef({
    shortId: `pm-wrong-${opts.wrongFormat.toLowerCase()}`,
    name: `Wrong ${opts.wrongFormat}`,
    format: opts.wrongFormat,
  })
  const pedal = createMockDefinition("boost-pedal", {
    id: "item-shops:boost-pedal",
    name: "Boost Pedal",
  })
  const broken = createMockDefinition(opts.brokenShortId, {
    id: `item-shops:${opts.brokenShortId}`,
    name: opts.brokenName,
    stackable: false,
    maxStack: 1,
  })
  const defsById = new Map<string, ItemDefinition>(
    [...matching, wrong, pedal, broken].map((d) => [d.id, d]),
  )

  function setup(target: InventoryItem, extra?: { allDefs?: ItemDefinition[] }) {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: actorId })
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: actorId,
      items: [target],
      maxSlots: 20,
      maxCollectionSlots: 20,
    })
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) => {
      return defsById.get(id) ?? extra?.allDefs?.find((d) => d.id === id) ?? null
    })
    if (extra?.allDefs) {
      vi.mocked(deps.context.inventory.getAllItemDefinitions).mockResolvedValue(extra.allDefs)
    }
    vi.mocked(deps.context.inventory.updateItemMetadata).mockResolvedValue(target)
    vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(
      stack(primary, {
        itemId: "restored-1",
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
      }),
    )
    return { deps, actor }
  }

  const cleanerDef = createMockDefinition(opts.item.shortId, {
    name: opts.itemLabel,
    requiresTarget: "mediaItem",
  })

  describe(opts.item.shortId, () => {
    test(`restores Poor → Good on a ${primary.mediaFormat} copy`, async () => {
      const target = stack(primary, {
        itemId: "pm-poor",
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
      })
      const { deps, actor } = setup(target)

      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })

      expect(result.success).toBe(true)
      expect(result.consumed).toBe(true)
      expect(deps.context.inventory.updateItemMetadata).toHaveBeenCalledWith(
        actor.userId,
        target.itemId,
        { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
      )
      expect(deps.context.api.sendUserSystemMessage).toHaveBeenCalledWith(
        "room-1",
        actor.userId,
        `${primary.name} is now in Good condition.`,
        expect.objectContaining({ type: "alert", status: "info" }),
      )
    })

    for (const extra of matching.slice(1)) {
      test(`also restores a Poor ${extra.mediaFormat} copy`, async () => {
        const target = stack(extra, {
          itemId: `pm-poor-${extra.mediaFormat}`,
          metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
        })
        const { deps, actor } = setup(target)
        const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
          targetInventoryItemId: target.itemId,
        })
        expect(result.success).toBe(true)
        expect(deps.context.inventory.updateItemMetadata).toHaveBeenCalledWith(
          actor.userId,
          target.itemId,
          { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
        )
      })
    }

    test("Mint ⇒ did-nothing and consumed", async () => {
      const target = stack(primary, {
        itemId: "pm-mint",
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "mint" },
      })
      const { deps, actor } = setup(target)
      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result).toEqual({
        success: false,
        consumed: true,
        message: `${opts.itemLabel} used on ${primary.name}. It did nothing.`,
      })
      expect(deps.context.inventory.updateItemMetadata).not.toHaveBeenCalled()
    })

    test("wrong format ⇒ did-nothing and consumed", async () => {
      const target = stack(wrong, {
        itemId: "pm-wrong",
        metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" },
      })
      const { deps, actor } = setup(target)
      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result.success).toBe(false)
      expect(result.consumed).toBe(true)
      expect(result.message).toBe(`${opts.itemLabel} used on ${wrong.name}. It did nothing.`)
      expect(deps.context.inventory.updateItemMetadata).not.toHaveBeenCalled()
    })

    test("non-media target (a pedal) ⇒ did-nothing and consumed", async () => {
      const target = stack(pedal, { itemId: "pedal-1" })
      const { deps, actor } = setup(target)
      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result).toEqual({
        success: false,
        consumed: true,
        message: `${opts.itemLabel} used on Boost Pedal. It did nothing.`,
      })
    })

    test("broken SKU with mediaOrigin restores that record at poor", async () => {
      const target = stack(broken, {
        itemId: "broken-1",
        metadata: { [PHYSICAL_MEDIA_ORIGIN_KEY]: primary.id },
      })
      const { deps, actor } = setup(target)
      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })
      expect(result.success).toBe(true)
      expect(result.consumed).toBe(true)
      expect(result.message).toBe(
        `${opts.brokenName} has been restored to ${primary.name} in Poor condition.`,
      )
      expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(actor.userId, primary.id, 1, {
        [PHYSICAL_MEDIA_CONDITION_KEY]: "poor",
      })
      expect(deps.context.inventory.removeItem).toHaveBeenCalledWith(actor.userId, target.itemId, 1)
    })

    test("broken SKU without origin restores a random format-matched record", async () => {
      const other = pmDef({
        shortId: "pm-random-other",
        name: "Other Match",
        format: primary.mediaFormat ?? "CD",
      })
      const target = stack(broken, { itemId: "broken-shop" })
      const { deps, actor } = setup(target, { allDefs: [wrong, other, primary] })
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)

      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })

      expect(result.success).toBe(true)
      expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(actor.userId, other.id, 1, {
        [PHYSICAL_MEDIA_CONDITION_KEY]: "poor",
      })
      randomSpy.mockRestore()
    })

    test("giveItem returning null ⇒ consumed false and removeItem never called", async () => {
      const target = stack(broken, {
        itemId: "broken-full",
        metadata: { [PHYSICAL_MEDIA_ORIGIN_KEY]: primary.id },
      })
      const { deps, actor } = setup(target)
      vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(null)

      const result = await invokeUse(opts.item, deps, actor.userId, cleanerDef, {
        targetInventoryItemId: target.itemId,
      })

      expect(result).toEqual({
        success: false,
        consumed: false,
        message: "Your collection is full.",
      })
      expect(deps.context.inventory.removeItem).not.toHaveBeenCalled()
    })

    test("missing target is not consumed", async () => {
      const deps = createMockDeps()
      const result = await invokeUse(opts.item, deps, actorId, cleanerDef, {})
      expect(result).toEqual({
        success: false,
        consumed: false,
        message: "Select something to use it on.",
      })
    })
  })
}
