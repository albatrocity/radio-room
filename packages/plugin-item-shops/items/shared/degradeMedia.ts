import type {
  ItemDefinition,
  ItemUseResult,
  MediaCondition,
  PhysicalMediaFormat,
} from "@repo/types"
import { PHYSICAL_MEDIA_CONDITION_KEY, PHYSICAL_MEDIA_ORIGIN_KEY } from "@repo/types"
import {
  degradeCondition,
  isPhysicalMediaDefinition,
  readItemCondition,
} from "../../localLibrary/condition"
import { definitionIdForShortId } from "../../localLibrary/grants"
import { brokenMediaForRecord, formatFromArtworkFrame } from "./brokenMedia"
import {
  albumTitleFromItemName,
  loadMediaItemTarget,
  mediaItemDidNothing,
  type LoadedMediaItemTarget,
} from "./restoreMedia"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

export type DegradeMediaOpts = {
  formats: readonly PhysicalMediaFormat[]
  itemLabel: string
  intactToast: (args: {
    albumTitle: string
    condition: MediaCondition
    format: PhysicalMediaFormat
  }) => Pick<ItemUseResult, "title" | "message" | "duration">
  brokenToast: (args: {
    recordName: string
    format: PhysicalMediaFormat
  }) => Pick<ItemUseResult, "title" | "message" | "duration">
}

export function physicalMediaFormatOf(def: ItemDefinition): PhysicalMediaFormat | undefined {
  if (!isPhysicalMediaDefinition(def)) return undefined
  return def.mediaFormat ?? formatFromArtworkFrame(def.artworkFrame) ?? undefined
}

export async function degradeLoadedMediaItem(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  loaded: LoadedMediaItemTarget,
  opts: DegradeMediaOpts,
): Promise<ItemUseResult> {
  const formatSet = new Set(opts.formats)
  const { context } = deps
  const { target, def, inv, targetName } = loaded
  const didNothing = () => mediaItemDidNothing(opts.itemLabel, targetName)

  if (!def) return didNothing()
  const format = physicalMediaFormatOf(def)
  if (format == null || !formatSet.has(format)) return didNothing()

  const next = degradeCondition(readItemCondition(target))
  if (next) {
    await context.inventory.updateItemMetadata(userId, target.itemId, {
      [PHYSICAL_MEDIA_CONDITION_KEY]: next,
    })
    return {
      success: true,
      consumed: true,
      toastType: "warning",
      ...opts.intactToast({
        albumTitle: albumTitleFromItemName(def.name),
        condition: next,
        format,
      }),
    }
  }

  const broken = brokenMediaForRecord({ mediaFormat: format })
  await context.inventory.removeItem(userId, target.itemId, 1, { degraded: true })

  if (broken) {
    const remaining = {
      ...inv,
      items: inv.items.filter((item) => item.itemId !== target.itemId),
    }
    await context.inventory.giveItem(
      userId,
      definitionIdForShortId(deps.pluginName, broken.shortId),
      1,
      { [PHYSICAL_MEDIA_ORIGIN_KEY]: target.definitionId },
      "plugin",
      remaining,
    )
  }

  return {
    success: true,
    consumed: true,
    toastType: "warning",
    ...opts.brokenToast({ recordName: def.name, format }),
  }
}

export function degradeMediaUse(opts: DegradeMediaOpts): ItemUseHandler {
  return async (deps, userId, _definition, callContext) => {
    const loaded = await loadMediaItemTarget(deps, userId, callContext)
    if (!loaded.ok) return loaded.result
    return degradeLoadedMediaItem(deps, userId, loaded, opts)
  }
}
