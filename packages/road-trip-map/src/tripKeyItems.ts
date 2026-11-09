import type { ItemDefinition } from "@repo/types"
import type { TripKeyItem, TripMap } from "./schema"
import { ROAD_TRIP_PLUGIN_NAME, roadTripItemId } from "./van"

/**
 * Key items a trip defines (ADR 0230). Each is the inventory item
 * `road-trip:key-{id}`, so a shop can sell one; Road Trip moves a bought key
 * into the van. In the van it does nothing by itself: conditions read it.
 */

const KEY_ITEM_PREFIX = "key-"

/** `overlook-ticket` → `key-overlook-ticket`. The prefix keeps key ids off other road-trip short ids. */
export function tripKeyItemShortId(keyId: string): string {
  return `${KEY_ITEM_PREFIX}${keyId}`
}

/** Whether `shortId` names a trip key item (on any trip). */
export function isTripKeyItemShortId(shortId: string): boolean {
  return shortId.startsWith(KEY_ITEM_PREFIX)
}

/** The key id behind a full definition id like `road-trip:key-overlook-ticket`, if it is one. */
export function tripKeyIdForDefinition(definitionId: string): string | undefined {
  const prefix = `${ROAD_TRIP_PLUGIN_NAME}:${KEY_ITEM_PREFIX}`
  return definitionId.startsWith(prefix) ? definitionId.slice(prefix.length) : undefined
}

/** Full definition id for a key id. */
export function tripKeyItemDefinitionId(keyId: string): string {
  return roadTripItemId(tripKeyItemShortId(keyId))
}

/** The trip's key item behind an item short id, if any. */
export function tripKeyItemFor(
  map: Pick<TripMap, "keyItems"> | undefined,
  shortId: string,
): TripKeyItem | undefined {
  if (!isTripKeyItemShortId(shortId)) return undefined
  const id = shortId.slice(KEY_ITEM_PREFIX.length)
  return map?.keyItems?.find((key) => key.id === id)
}

/**
 * Inventory definitions for the trip's key items, registered by Road Trip and
 * Game Studio. Inert: not usable, not stackable, not tradeable.
 */
export function tripKeyItemDefinitions(
  map: Pick<TripMap, "keyItems"> | undefined,
): Omit<ItemDefinition, "id" | "sourcePlugin">[] {
  return (map?.keyItems ?? []).map((key) => ({
    shortId: tripKeyItemShortId(key.id),
    name: key.name,
    description:
      key.description ?? "Something the group picked up on the road. It rides in the van.",
    icon: "Key",
    stackable: false,
    maxStack: 1,
    tradeable: false,
    consumable: false,
    coinValue: key.coinValue,
    rarity: "common",
  }))
}
