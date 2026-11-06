import type { ItemDefinition, LucideIconName } from "@repo/types"
import {
  BOOK_IDS,
  BOOK_USE_LABEL,
  EVENT_FAMILY_LABELS,
  GAS_CANISTER,
  TRIP_BOOKS,
  VAN_FUEL_ITEMS,
  vanFuelItem,
  tripGuideItem,
  isTripMapItemShortId,
  tripMapForItem,
  TRIP_GUIDE_ITEMS,
  vanConsumable,
  vanPart,
  VAN_CONSUMABLES,
  VAN_ITEM_IDS,
  VAN_PARTS,
  type TripMap,
} from "@repo/road-trip-map"
import { routeRead } from "../trip/books"
import { contextFor } from "../trip/commit"
import { guideRevealTargets, layersToUnlock } from "../trip/guide"
import { itemEndsCurrentStep } from "../trip/incidents"
import type { TripState } from "../trip/state"
import { pourRefusal } from "../trip/transitions"

type RoadTripItemDefinition = Omit<ItemDefinition, "id" | "sourcePlugin">

const ICONS: Record<string, LucideIconName> = {
  [VAN_ITEM_IDS.spoiler]: "Wind",
  [VAN_ITEM_IDS.turbo]: "Flame",
  [VAN_ITEM_IDS.tires]: "Disc",
  [VAN_ITEM_IDS.horn]: "Megaphone",
  [VAN_ITEM_IDS.aaa]: "CreditCard",
  [VAN_ITEM_IDS.fixAFlat]: "SprayCan",
  [VAN_ITEM_IDS.cbRadio]: "Radio",
  [VAN_ITEM_IDS.tripGuide]: "BookOpen",
  [GAS_CANISTER.shortId]: "Fuel",
  [BOOK_IDS.investmentAdvice]: "TrendingUp",
  [BOOK_IDS.negotiating]: "Handshake",
  [BOOK_IDS.defensiveDriving]: "Shield",
  [BOOK_IDS.basicMechanics]: "Wrench",
  [BOOK_IDS.advancedMechanics]: "GraduationCap",
}

/**
 * GLB filenames in `items/<shortId>/`, published to `assets/items/<shortId>/` by
 * `apps/web/scripts/syncItemModels.sh` alongside Item Shops (ADR 0199, 0210).
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
  ...TRIP_GUIDE_ITEMS.map(
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
  ...VAN_FUEL_ITEMS.map(
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
  ...TRIP_BOOKS.map(
    (book): RoadTripItemDefinition => ({
      shortId: book.shortId,
      name: book.name,
      description: book.description,
      icon: ICONS[book.shortId],
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      useLabel: BOOK_USE_LABEL,
      coinValue: book.coinValue,
      rarity: book.rarity,
      ...modelFields(book.shortId),
    }),
  ),
]

export type RoadTripItemUse =
  | { kind: "install"; partId: string }
  | { kind: "resolve"; shortId: string }
  /** A trip map: unlock every locked layer that opts into it (ADR 0227). */
  | { kind: "unlock-layers"; shortId: string }
  /** Trip Guide: reveal the non-secret sites ahead (ADR 0222). */
  | { kind: "reveal-ahead"; shortId: string }
  /** A book (ADR 0228); `learned` false when it goes over the reader's head (still spent). */
  | { kind: "read"; shortId: string; learned: boolean }
  /** Gas Canister: pour its gallons into the tank (ADR 0228). */
  | { kind: "pour"; shortId: string; gallons: number }
  | { kind: "refused"; message: string }

/**
 * What using `shortId` does right now, or why it can't (the item is kept).
 * Checked before the CAS for the message; the transition re-checks. `map` is
 * the authored map; `userId` is the reader, for books.
 */
export function routeItemUse(
  state: TripState | null,
  shortId: string,
  map?: TripMap,
  now = Date.now(),
  userId?: string,
): RoadTripItemUse {
  const read = userId !== undefined ? routeRead(state, shortId, userId) : null
  if (read) return read.kind === "read" ? { kind: "read", shortId, learned: read.learned } : read
  const fuel = vanFuelItem(shortId)
  if (fuel) {
    if (!state || !map) return { kind: "refused", message: "Save it for the road." }
    const refusal = pourRefusal(state, contextFor(state, map, now).gallonsUsed)
    return refusal
      ? { kind: "refused", message: refusal }
      : { kind: "pour", shortId, gallons: fuel.gallons }
  }
  const live = state && map && (state.status === "loaded" || state.status === "driving")
  if (isTripMapItemShortId(shortId)) {
    if (!live) return { kind: "refused", message: "Save it for a trip." }
    if (!tripMapForItem(map, shortId)) {
      return { kind: "refused", message: "This map is for a different trip." }
    }
    return layersToUnlock(state, map, shortId).length > 0
      ? { kind: "unlock-layers", shortId }
      : { kind: "refused", message: "This map has nothing more to show you." }
  }
  const guide = tripGuideItem(shortId)
  if (guide) {
    const idle: RoadTripItemUse = { kind: "refused", message: guide.idle }
    if (!live) return { kind: "refused", message: "Save it for a trip." }
    if (state.status !== "driving") return { kind: "refused", message: "Save it for the road." }
    return guideRevealTargets(state, contextFor(state, map, now)).length > 0
      ? { kind: "reveal-ahead", shortId }
      : idle
  }
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
  if (state?.status !== "driving" || !itemEndsCurrentStep(state, shortId)) {
    return { kind: "refused", message: `Save it for a ${EVENT_FAMILY_LABELS[item.resolves]}.` }
  }
  return { kind: "resolve", shortId }
}
