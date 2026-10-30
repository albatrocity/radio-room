import type { ItemDefinition } from "@repo/types"
import type { TripLayer, TripMap, TripMapItem } from "./schema"

/**
 * Maps a trip sells (ADR 0227). Each is the inventory item
 * `road-trip:map-{id}`; using one unlocks every locked layer that lists it.
 */

const MAP_ITEM_PREFIX = "map-"

/** `scenic` → `map-scenic`. The prefix keeps map ids off van item short ids. */
export function tripMapItemShortId(mapId: string): string {
  return `${MAP_ITEM_PREFIX}${mapId}`
}

/** Whether `shortId` names a trip map item (on any trip). */
export function isTripMapItemShortId(shortId: string): boolean {
  return shortId.startsWith(MAP_ITEM_PREFIX)
}

/** The trip's map behind an item short id, if any. */
export function tripMapForItem(
  map: Pick<TripMap, "maps"> | undefined,
  shortId: string,
): TripMapItem | undefined {
  if (!isTripMapItemShortId(shortId)) return undefined
  const id = shortId.slice(MAP_ITEM_PREFIX.length)
  return map?.maps?.find((m) => m.id === id)
}

/** Layers that opt into `mapId`, in authored order. */
export function layersRevealedBy(map: Pick<TripMap, "layers">, mapId: string): TripLayer[] {
  return (map.layers ?? []).filter((layer) => layer.maps?.includes(mapId))
}

/** Inventory definitions for the trip's maps, registered by Road Trip and Game Studio. */
export function tripMapItemDefinitions(
  map: Pick<TripMap, "maps"> | undefined,
): Omit<ItemDefinition, "id" | "sourcePlugin">[] {
  return (map?.maps ?? []).map((item) => ({
    shortId: tripMapItemShortId(item.id),
    name: item.name,
    description: item.description ?? "Use it on this trip to mark the spots it knows about.",
    icon: "Map",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: item.coinValue,
    rarity: "common",
  }))
}
