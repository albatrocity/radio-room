import type {
  ItemDefinition,
  ItemUseResult,
  MediaCondition,
  PhysicalMediaFormat,
} from "@repo/types"
import { MEDIA_CONDITION_LABELS, PHYSICAL_MEDIA_CONDITION_KEY } from "@repo/types"
import {
  isPhysicalMediaDefinition,
  readItemCondition,
  restoreCondition,
} from "../../localLibrary/condition"
import { physicalMediaTypeLabel } from "../../localLibrary/physicalMedia"
import {
  formatFromArtworkFrame,
  FORMATS_BY_BROKEN_SHORT_ID,
  isBrokenMediaShortId,
  readMediaOrigin,
} from "./brokenMedia"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

const FORMAT_NAME_PREFIX = /^(CD|LP|Cassette|45):\s+/i

/** Strip the `LP: ` shop prefix so toast copy can use the album title. */
export function albumTitleFromItemName(name: string): string {
  const stripped = name.replace(FORMAT_NAME_PREFIX, "").trim()
  return stripped || name
}

export function restoreSuccessToast(opts: {
  format: PhysicalMediaFormat
  condition: MediaCondition
  albumTitle: string
  successBody: (albumTitle: string) => string
}): Pick<ItemUseResult, "title" | "message"> {
  return {
    title: `${physicalMediaTypeLabel(opts.format)} restored to ${MEDIA_CONDITION_LABELS[opts.condition]} condition!`,
    message: opts.successBody(opts.albumTitle),
  }
}

export function restoreMediaUse(opts: {
  formats: readonly PhysicalMediaFormat[]
  itemLabel: string
  successBody: (albumTitle: string) => string
}): ItemUseHandler {
  const formatSet = new Set(opts.formats)

  return async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    _definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> => {
    const ctx = callContext as { targetInventoryItemId?: string } | undefined
    const targetInventoryItemId = ctx?.targetInventoryItemId?.trim()
    if (!targetInventoryItemId) {
      return { success: false, consumed: false, message: "Select something to use it on." }
    }

    const { context } = deps
    const inv = await context.inventory.getInventory(userId)
    const target = inv.items.find((i) => i.itemId === targetInventoryItemId)
    if (!target) {
      return { success: false, consumed: false, message: "That item is not in your inventory." }
    }

    const def = await context.inventory.getItemDefinition(target.definitionId)
    const targetName = def?.name ?? target.definitionId

    const didNothing = (): ItemUseResult => ({
      success: false,
      consumed: true,
      message: `${opts.itemLabel} used on ${targetName}. It did nothing.`,
    })

    if (def && isPhysicalMediaDefinition(def)) {
      const format = def.mediaFormat ?? formatFromArtworkFrame(def.artworkFrame)
      if (format == null || !formatSet.has(format)) return didNothing()

      const next = restoreCondition(readItemCondition(target))
      if (next == null) return didNothing()

      await context.inventory.updateItemMetadata(userId, target.itemId, {
        [PHYSICAL_MEDIA_CONDITION_KEY]: next,
      })
      return {
        success: true,
        consumed: true,
        ...restoreSuccessToast({
          format,
          condition: next,
          albumTitle: albumTitleFromItemName(def.name),
          successBody: opts.successBody,
        }),
      }
    }

    if (def && isBrokenMediaShortId(def.shortId)) {
      const brokenFormats = FORMATS_BY_BROKEN_SHORT_ID[def.shortId] ?? []
      const eligible = brokenFormats.filter((f) => formatSet.has(f))
      if (eligible.length === 0) return didNothing()

      const originId = readMediaOrigin(target)
      const originDef = originId ? await context.inventory.getItemDefinition(originId) : null
      let restored = originDef
      if (!restored) {
        const catalog = await context.inventory.getAllItemDefinitions()
        const eligibleSet = new Set(eligible)
        const candidates = catalog.filter((d) => {
          if (!isPhysicalMediaDefinition(d) || d.slotPool !== "collection") return false
          const format = d.mediaFormat ?? formatFromArtworkFrame(d.artworkFrame)
          return format != null && eligibleSet.has(format)
        })
        if (candidates.length === 0) {
          return {
            success: false,
            consumed: false,
            message: "There's nothing to restore it to.",
          }
        }
        restored = candidates[Math.floor(Math.random() * candidates.length)] ?? null
      }
      if (!restored) {
        return {
          success: false,
          consumed: false,
          message: "There's nothing to restore it to.",
        }
      }

      const given = await context.inventory.giveItem(userId, restored.id, 1, {
        [PHYSICAL_MEDIA_CONDITION_KEY]: "poor",
      })
      if (!given) {
        return { success: false, consumed: false, message: "Your collection is full." }
      }

      await context.inventory.removeItem(userId, target.itemId, 1)
      const format =
        restored.mediaFormat ?? formatFromArtworkFrame(restored.artworkFrame) ?? eligible[0]!
      return {
        success: true,
        consumed: true,
        ...restoreSuccessToast({
          format,
          condition: "poor",
          albumTitle: albumTitleFromItemName(restored.name),
          successBody: opts.successBody,
        }),
      }
    }

    return didNothing()
  }
}
