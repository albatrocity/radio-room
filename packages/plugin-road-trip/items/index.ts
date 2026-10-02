import type { ItemDefinition, LucideIconName } from "@repo/types"
import {
  INCIDENTS,
  vanConsumable,
  vanPart,
  VAN_CONSUMABLES,
  VAN_ITEM_IDS,
  VAN_PARTS,
} from "@repo/road-trip-map"
import type { TripState } from "../trip/state"

type RoadTripItemDefinition = Omit<ItemDefinition, "id" | "sourcePlugin">

const ICONS: Record<string, LucideIconName> = {
  [VAN_ITEM_IDS.spoiler]: "Wind",
  [VAN_ITEM_IDS.turbo]: "Flame",
  [VAN_ITEM_IDS.tires]: "Disc",
  [VAN_ITEM_IDS.horn]: "Megaphone",
  [VAN_ITEM_IDS.aaa]: "CreditCard",
  [VAN_ITEM_IDS.fixAFlat]: "SprayCan",
  [VAN_ITEM_IDS.cbRadio]: "Radio",
}

/**
 * GLB filenames in `items/<shortId>/`, published to `assets/items/<shortId>/` by
 * `apps/web/scripts/syncItemModels.sh` alongside Item Shops (ADR 0199, 0205).
 */
export const ITEM_MODELS: Partial<Record<string, string>> = {}

function modelFields(shortId: string): Pick<RoadTripItemDefinition, "model" | "detailView"> {
  const model = ITEM_MODELS[shortId]
  return model ? { model, detailView: { layout: "default" } } : {}
}

/**
 * Van parts and consumables (M3) as inventory items. Parts are spent when
 * installed (the van keeps them, not the traveler); consumables when they end
 * an incident. Sold through Item Shops' custom offers at trip sites.
 */
export const ROAD_TRIP_ITEM_DEFINITIONS: RoadTripItemDefinition[] = [
  ...VAN_PARTS.map(
    (part): RoadTripItemDefinition => ({
      shortId: part.shortId,
      name: part.name,
      description: `${part.description} Use it to install it on the van.`,
      icon: ICONS[part.shortId],
      stackable: false,
      maxStack: 1,
      tradeable: true,
      consumable: true,
      coinValue: part.coinValue,
      rarity: "uncommon",
      ...modelFields(part.shortId),
    }),
  ),
  ...VAN_CONSUMABLES.map(
    (item): RoadTripItemDefinition => ({
      shortId: item.shortId,
      name: item.name,
      description: item.description,
      icon: ICONS[item.shortId],
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      coinValue: item.coinValue,
      rarity: "common",
      ...modelFields(item.shortId),
    }),
  ),
]

export type RoadTripItemUse =
  | { kind: "install"; partId: string }
  | { kind: "resolve"; shortId: string }
  | { kind: "refused"; message: string }

/**
 * What using `shortId` does right now, or why it can't (the item is kept).
 * Checked before the CAS for the message; the transition re-checks.
 */
export function routeItemUse(state: TripState | null, shortId: string): RoadTripItemUse {
  const part = vanPart(shortId)
  if (part) {
    if (!state || (state.status !== "loaded" && state.status !== "driving")) {
      return { kind: "refused", message: "There's no van to install it on right now." }
    }
    if (state.parts[part.slot]?.partId === shortId) {
      return { kind: "refused", message: `The van already has a ${part.name}.` }
    }
    return { kind: "install", partId: shortId }
  }
  const item = vanConsumable(shortId)
  if (!item) return { kind: "refused", message: "That isn't a road-trip item." }
  const incident = state?.status === "driving" ? state.incident : undefined
  const step = incident?.steps[incident.step]
  const usable =
    incident?.incident === item.resolves &&
    ((step?.kind === "window" && step.resolvesWith.includes(shortId)) || step?.kind === "slow")
  if (!usable) {
    return {
      kind: "refused",
      message: `Save it for a ${INCIDENTS[item.resolves].name.toLowerCase()}.`,
    }
  }
  return { kind: "resolve", shortId }
}
