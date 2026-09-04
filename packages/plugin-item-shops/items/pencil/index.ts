import type {
  ItemDefinition,
  ItemUseResult,
  MediaCondition,
  PhysicalMediaFormat,
} from "@repo/types"
import { MEDIA_CONDITION_LABELS } from "@repo/types"
import { physicalMediaTypeLabel } from "../../localLibrary/physicalMedia"
import { BROKEN_MEDIA_BY_FORMAT } from "../shared/brokenMedia"
import {
  degradeLoadedMediaItem,
  physicalMediaFormatOf,
  type DegradeMediaOpts,
} from "../shared/degradeMedia"
import {
  loadMediaItemTarget,
  restoreLoadedMediaItem,
  RESTORE_TOAST_DURATION_MS,
  type RestoreMediaOpts,
} from "../shared/restoreMedia"
import { createItem } from "../shared/types"

export function pencilDegradeIntactToast(opts: {
  albumTitle: string
  condition: MediaCondition
  format: PhysicalMediaFormat
}): Pick<ItemUseResult, "title" | "message" | "duration"> {
  const formatLabel = physicalMediaTypeLabel(opts.format)
  return {
    title: `${opts.albumTitle} dropped to ${MEDIA_CONDITION_LABELS[opts.condition]} condition!`,
    message: `What are you doing?! These are not for drawing on! You scratched the ${formatLabel}.`,
    duration: RESTORE_TOAST_DURATION_MS,
  }
}

export function pencilDegradeBrokenToast(opts: {
  recordName: string
  format: PhysicalMediaFormat
}): Pick<ItemUseResult, "title" | "message" | "duration"> {
  const formatLabel = physicalMediaTypeLabel(opts.format)
  return {
    title: BROKEN_MEDIA_BY_FORMAT[opts.format].transitionMessage(opts.recordName),
    message: `For some reason, you used a Pencil on this ${formatLabel} and ruined it completely.`,
    duration: RESTORE_TOAST_DURATION_MS,
  }
}

const RESTORE_OPTS: RestoreMediaOpts = {
  formats: ["TAPE"],
  itemLabel: "Pencil",
  successBody: (albumTitle) =>
    `You used the pencil to respool the tape and brought ${albumTitle} back to life.`,
}

const DEGRADE_FORMATS: readonly PhysicalMediaFormat[] = ["CD", "LP", "45"]

const DEGRADE_OPTS: DegradeMediaOpts = {
  formats: DEGRADE_FORMATS,
  itemLabel: "Pencil",
  intactToast: pencilDegradeIntactToast,
  brokenToast: pencilDegradeBrokenToast,
}

export const pencil = createItem({
  shortId: "pencil",
  definition: {
    name: "Pencil",
    description: "A No. 2 pencil. The eraser's chewed, but the tip is sharp.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "mediaItem",
    coinValue: 25,
    icon: "Pencil",
    rarity: "uncommon",
  },
  use: async (deps, userId, _definition: ItemDefinition, callContext) => {
    const loaded = await loadMediaItemTarget(deps, userId, callContext)
    if (!loaded.ok) return loaded.result
    const format = loaded.def ? physicalMediaFormatOf(loaded.def) : undefined
    if (format && DEGRADE_FORMATS.includes(format)) {
      return degradeLoadedMediaItem(deps, userId, loaded, DEGRADE_OPTS)
    }
    return restoreLoadedMediaItem(deps, userId, loaded, RESTORE_OPTS)
  },
})
