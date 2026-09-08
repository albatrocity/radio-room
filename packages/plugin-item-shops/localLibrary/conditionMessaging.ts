import {
  brokenMediaOriginHint,
  BROKEN_RESTORE_CAVEAT,
  STALE_PHYSICAL_MEDIA_EMPTY,
} from "@repo/game-logic"
import type { MediaCondition, PhysicalMediaFormat } from "@repo/types"
import { MEDIA_CONDITION_LABELS } from "@repo/types"

export { brokenMediaOriginHint, BROKEN_RESTORE_CAVEAT, STALE_PHYSICAL_MEDIA_EMPTY }

/** Default ItemDefinition.description for derived Record Store holdings (ADR 0155 / messaging plan). */
export function cannedPhysicalMediaDescription(formatLabel: string): string {
  return `A ${formatLabel} from the Record Store.`
}

/** Intact queue-wear toast body by format (discovered mechanic — no ladder teaching). */
export function intactWearToastDescription(format: PhysicalMediaFormat | undefined): string {
  switch (format) {
    case "CD":
      return "It got scuffed up a bit on playback"
    case "LP":
    case "45":
      return "It got a little dusty on playback"
    case "TAPE":
      return "It got a little worn on playback"
    default:
      return "It got a little worn on playback"
  }
}

export function intactWearToastTitle(recordName: string, next: MediaCondition): string {
  return `${recordName} is now in ${MEDIA_CONDITION_LABELS[next]} condition.`
}

/** Broken SKU display names for convert toasts. */
export function brokenMediaInventoryName(shortId: string): string {
  switch (shortId) {
    case "scratched-cd":
      return "Scratched CD"
    case "dusty-record":
      return "Dusty Record"
    case "tangled-tape":
      return "Tangled Tape"
    default:
      return "worn-out copy"
  }
}

export function convertWearToastDescription(opts: {
  brokenShortId?: string
  given: boolean
}): string {
  const woreOutLine = "You can no longer queue songs from it."
  if (!opts.brokenShortId) return woreOutLine
  if (!opts.given) {
    return `${woreOutLine} You had no room to keep the worn-out copy.`
  }
  const name = brokenMediaInventoryName(opts.brokenShortId)
  return `${woreOutLine} It's now a ${name} in Inventory.`
}
