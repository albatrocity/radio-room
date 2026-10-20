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

type DeviceCatalogMaps = {
  formats: ReadonlyMap<string, readonly PhysicalMediaFormat[]>
  gentleFormats: ReadonlyMap<string, readonly PhysicalMediaFormat[]>
}

/**
 * Playback devices must be registered in `ITEM_CATALOG` (static SKUs that set
 * `playbackFormats`). Derived grants and Physical Media never carry that field,
 * so this process-lifetime map is complete without cloning the room catalog.
 * Entries with `gentlePlayback: true` also populate the gentle map (ADR 0166).
 */
const DEVICE_MAPS: DeviceCatalogMaps = (() => {
  const formats = new Map<string, readonly PhysicalMediaFormat[]>()
  const gentleFormats = new Map<string, readonly PhysicalMediaFormat[]>()
  for (const entry of ITEM_CATALOG) {
    const playbackFormats = entry.definition.playbackFormats
    if (!playbackFormats || playbackFormats.length === 0) continue
    const id = definitionIdForShortId(ITEM_SHOPS_PLUGIN_NAME, entry.definition.shortId)
    formats.set(id, playbackFormats)
    if (entry.definition.gentlePlayback) {
      gentleFormats.set(id, playbackFormats)
    }
  }
  return { formats, gentleFormats }
})()

function formatsFromHeld(
  items: InventoryItem[],
  map: ReadonlyMap<string, readonly PhysicalMediaFormat[]>,
  shared: Iterable<PhysicalMediaFormat>,
): Set<PhysicalMediaFormat> {
  const out = new Set<PhysicalMediaFormat>(shared)
  for (const item of items) {
    if (item.quantity <= 0) continue
    const formats = map.get(item.definitionId)
    if (!formats) continue
    for (const format of formats) out.add(format)
  }
  return out
}

/**
 * Union of `playbackFormats` across held device stacks, plus room-shared
 * formats such as the trip van's (ADR 0215).
 */
export function playableFormats(
  items: InventoryItem[],
  shared: Iterable<PhysicalMediaFormat> = [],
): Set<PhysicalMediaFormat> {
  return formatsFromHeld(items, DEVICE_MAPS.formats, shared)
}

/**
 * Union of `playbackFormats` across held devices with `gentlePlayback: true`
 * (ADR 0166), plus gentle shared formats. Matching Physical Media is not worn on queue.
 */
export function gentlePlayableFormats(
  items: InventoryItem[],
  shared: Iterable<PhysicalMediaFormat> = [],
): Set<PhysicalMediaFormat> {
  return formatsFromHeld(items, DEVICE_MAPS.gentleFormats, shared)
}

/** False for library cards and operator grants — they carry no `mediaFormat`. */
export function requiresPlaybackDevice(held: Pick<HeldLocalLibraryGrant, "mediaFormat">): boolean {
  return held.mediaFormat != null
}
