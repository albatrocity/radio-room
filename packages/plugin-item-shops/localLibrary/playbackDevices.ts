import {
  PLAYBACK_DEVICE_MISSING_REASON,
  ITEM_SHOPS_PLUGIN_NAME,
  type InventoryItem,
  type PhysicalMediaFormat,
} from "@repo/types"
import { ITEM_CATALOG } from "../items/index"
import type { HeldLocalLibraryGrant } from "./grants"
import { definitionIdForShortId } from "./grants"

export { PLAYBACK_DEVICE_MISSING_REASON }

/**
 * Playback devices must be registered in `ITEM_CATALOG` (the four static SKUs
 * that set `playbackFormats`). Derived grants and Physical Media never carry
 * that field, so this process-lifetime map is complete without cloning the
 * room catalog.
 */
const PLAYBACK_DEVICE_FORMATS: ReadonlyMap<string, readonly PhysicalMediaFormat[]> = (() => {
  const map = new Map<string, readonly PhysicalMediaFormat[]>()
  for (const entry of ITEM_CATALOG) {
    const formats = entry.definition.playbackFormats
    if (!formats || formats.length === 0) continue
    map.set(definitionIdForShortId(ITEM_SHOPS_PLUGIN_NAME, entry.definition.shortId), formats)
  }
  return map
})()

/** Union of `playbackFormats` across held device stacks. */
export function playableFormats(items: InventoryItem[]): Set<PhysicalMediaFormat> {
  const out = new Set<PhysicalMediaFormat>()
  for (const item of items) {
    if (item.quantity <= 0) continue
    const formats = PLAYBACK_DEVICE_FORMATS.get(item.definitionId)
    if (!formats) continue
    for (const format of formats) out.add(format)
  }
  return out
}

/** False for library cards and operator grants — they carry no `mediaFormat`. */
export function requiresPlaybackDevice(held: HeldLocalLibraryGrant): boolean {
  return held.mediaFormat != null
}
