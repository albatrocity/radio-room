import type { ValidateShopResult } from "@repo/types"
import { RECORD_STORE_SHOP_ID } from "./localLibrary/catalog"

/**
 * Room shop rounds opened through the `shopAccess` capability (ADR 0201).
 * The scope marks the active round as owned by a caller (e.g. a road-trip
 * site stop) so only that caller's close ends it and auto-shop stands down.
 */
export const ROOM_SHOP_SCOPE_KEY = "room-shop:scope"

export type RoomShopScope = {
  scopeId: string
  shopIds: string[]
  title?: string
  openedAt: number
}

const UNAVAILABLE_NOTES: Record<string, string> = {
  [RECORD_STORE_SHOP_ID]:
    "Record Store only opens in rooms on the Media Bridge with a local library",
}

/**
 * Unknown ids are errors. Known shops this room can't open right now (Record
 * Store off the Media Bridge, or a shop with nothing for this room type) are
 * warnings, so the same map still loads in any room.
 */
export function validateRoomShopIds(
  shopIds: readonly string[],
  knownShopIds: ReadonlySet<string>,
  availableShopIds: ReadonlySet<string> = knownShopIds,
): ValidateShopResult {
  if (shopIds.length === 0) return { ok: false, errors: ["List at least one shop id."] }
  const errors = shopIds.filter((id) => !knownShopIds.has(id)).map((id) => `Unknown shop "${id}"`)
  if (errors.length > 0) return { ok: false, errors }
  const warnings = shopIds
    .filter((id) => !availableShopIds.has(id))
    .map(
      (id) =>
        `${UNAVAILABLE_NOTES[id] ?? `Shop "${id}" isn't available in this room`}; the van still stops`,
    )
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true }
}
