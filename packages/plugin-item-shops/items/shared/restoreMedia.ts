import type {
  InventoryItem,
  ItemDefinition,
  ItemUseResult,
  MediaCondition,
  PhysicalMediaFormat,
  UserInventory,
} from "@repo/types"
import {
  MEDIA_CONDITION_LABELS,
  PHYSICAL_MEDIA_CONDITION_KEY,
  resolveSlotPool,
  slotPoolFullClause,
} from "@repo/types"
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

/** Long enough to read the flavor line; default inventory toasts are ~5s. */
export const RESTORE_TOAST_DURATION_MS = 10_000

/** Strip the `LP: ` shop prefix so toast copy can use the album title. */
export function albumTitleFromItemName(name: string): string {
  const stripped = name.replace(FORMAT_NAME_PREFIX, "").trim()
  return stripped || name
}

/**
 * Collection-pool Physical Media whose format is in `eligible`. Used for
 * random restore of shop-bought broken SKUs (no `mediaOrigin`).
 */
export function pickRandomRestoreCandidateFromCatalog(
  catalog: readonly ItemDefinition[],
  eligible: readonly PhysicalMediaFormat[],
): ItemDefinition | null {
  const eligibleSet = new Set(eligible)
  const candidates = catalog.filter((d) => {
    if (!isPhysicalMediaDefinition(d) || resolveSlotPool(d) !== "collection") return false
    const format = d.mediaFormat ?? formatFromArtworkFrame(d.artworkFrame)
    return format != null && eligibleSet.has(format)
  })
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null
}

export function restoreSuccessToast(opts: {
  format: PhysicalMediaFormat
  condition: MediaCondition
  albumTitle: string
  successBody: (albumTitle: string) => string
}): Pick<ItemUseResult, "title" | "message" | "duration"> {
  return {
    title: `${physicalMediaTypeLabel(opts.format)} restored to ${MEDIA_CONDITION_LABELS[opts.condition]} condition!`,
    message: opts.successBody(opts.albumTitle),
    duration: RESTORE_TOAST_DURATION_MS,
  }
}

export type LoadedMediaItemTarget = {
  target: InventoryItem
  def: ItemDefinition | null
  inv: UserInventory
  targetName: string
}

export type LoadMediaItemTargetResult =
  | { ok: false; result: ItemUseResult }
  | ({ ok: true } & LoadedMediaItemTarget)

export function mediaItemDidNothing(itemLabel: string, targetName: string): ItemUseResult {
  return {
    success: false,
    consumed: true,
    message: `${itemLabel} used on ${targetName}. It did nothing.`,
  }
}

/** Shared target lookup for restore / degrade media-item uses. */
export async function loadMediaItemTarget(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  callContext?: unknown,
): Promise<LoadMediaItemTargetResult> {
  const ctx = callContext as { targetInventoryItemId?: string } | undefined
  const targetInventoryItemId = ctx?.targetInventoryItemId?.trim()
  if (!targetInventoryItemId) {
    return {
      ok: false,
      result: { success: false, consumed: false, message: "Select something to use it on." },
    }
  }

  const inv = await deps.context.inventory.getInventory(userId)
  const target = inv.items.find((i) => i.itemId === targetInventoryItemId)
  if (!target) {
    return {
      ok: false,
      result: { success: false, consumed: false, message: "That item is not in your inventory." },
    }
  }

  const def = await deps.context.inventory.getItemDefinition(target.definitionId)
  return { ok: true, target, def, inv, targetName: def?.name ?? target.definitionId }
}

export type RestoreMediaOpts = {
  formats: readonly PhysicalMediaFormat[]
  itemLabel: string
  successBody: (albumTitle: string) => string
}

export async function restoreLoadedMediaItem(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  loaded: LoadedMediaItemTarget,
  opts: RestoreMediaOpts,
): Promise<ItemUseResult> {
  const formatSet = new Set(opts.formats)
  const { context } = deps
  const { target, def, targetName } = loaded
  const didNothing = () => mediaItemDidNothing(opts.itemLabel, targetName)

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
      const picked = deps.pickRandomRestoreCandidate?.(eligible) ?? null
      restored = picked ? ((await context.inventory.getItemDefinition(picked.id)) ?? picked) : null
    }
    if (!restored) {
      return {
        success: false,
        consumed: false,
        message: "There's nothing to restore it to.",
      }
    }

    const given = await context.inventory.giveItem(
      userId,
      restored.id,
      1,
      {
        [PHYSICAL_MEDIA_CONDITION_KEY]: "poor",
      },
      "plugin",
      undefined,
      { restored: true },
    )
    if (!given) {
      return {
        success: false,
        consumed: false,
        message: `${slotPoolFullClause("collection")}.`,
      }
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

export function restoreMediaUse(opts: RestoreMediaOpts): ItemUseHandler {
  return async (deps, userId, _definition, callContext) => {
    const loaded = await loadMediaItemTarget(deps, userId, callContext)
    if (!loaded.ok) return loaded.result
    return restoreLoadedMediaItem(deps, userId, loaded, opts)
  }
}
