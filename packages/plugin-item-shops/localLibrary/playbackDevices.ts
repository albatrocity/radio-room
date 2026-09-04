import {
  PLAYBACK_DEVICE_MISSING_REASON,
  type InventoryItem,
  type ItemDefinition,
  type PhysicalMediaFormat,
} from "@repo/types"
import type { HeldLocalLibraryGrant } from "./grants"

export { PLAYBACK_DEVICE_MISSING_REASON }

/** Union of `playbackFormats` across held device stacks. */
export function playableFormats(params: {
  items: InventoryItem[]
  definitionById: Map<string, ItemDefinition>
}): Set<PhysicalMediaFormat> {
  const out = new Set<PhysicalMediaFormat>()
  for (const item of params.items) {
    if (item.quantity <= 0) continue
    const formats = params.definitionById.get(item.definitionId)?.playbackFormats
    if (!formats) continue
    for (const format of formats) out.add(format)
  }
  return out
}

/** False for library cards and operator grants — they carry no `mediaFormat`. */
export function requiresPlaybackDevice(held: HeldLocalLibraryGrant): boolean {
  return held.mediaFormat != null
}
