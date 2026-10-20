import type {
  ItemDefinition,
  PhysicalMediaPick,
  PhysicalMediaStock,
  RoomShopOffer,
  RoomShopSample,
  ValidateShopRequest,
  ValidateShopResult,
} from "@repo/types"
import { labelForMetadataSource } from "@repo/types"
import {
  ROOM_SHOP_ID_PREFIX,
  type ItemShopsShopCatalogEntry,
  type ShoppingExtraOffer,
} from "@repo/plugin-base"

/**
 * Room shop rounds opened through the `shopAccess` capability (ADR 0206).
 * The scope marks the active round as owned by a caller (e.g. a road-trip
 * site stop) so only that caller's close ends it and auto-shop stands down.
 */
export const ROOM_SHOP_SCOPE_KEY = "room-shop:scope"

export type RoomShopScope = {
  scopeId: string
  /** Custom offers (D14) re-resolved for late joiners. */
  offers?: RoomShopOffer[]
  /** The record bin (library filter plus picks), re-matched for late joiners (ADR 0214, 0216). */
  physicalMedia?: PhysicalMediaStock
  /** Buyback fraction for everything the shop buys back. Default 0. */
  buybackRate?: number
  /** When set, each traveler samples this way from `offers`. */
  sample?: RoomShopSample
  title?: string
  /** Author copy for the round. Posted to the room, and shown on the visit. */
  openingMessage?: string
  openedAt: number
}

/**
 * What a request's bin can stock here: derived records (and how many the
 * library filter matches), plus picks (ADR 0216).
 */
export type PhysicalMediaAvailability = {
  derived: number
  matching: number
  picks?: {
    total: number
    available: number
    unresolved: string[]
    unavailableSources: Record<string, number>
  }
}

/**
 * Offers and/or a record bin. Unknown offers are errors. A bin this room
 * can't fill is a warning, so the same map still loads in any room (ADR 0207).
 */
export function validateRoomShopRequest(
  req: ValidateShopRequest,
  known: { definitionIds: ReadonlySet<string>; physicalMedia?: PhysicalMediaAvailability },
): ValidateShopResult {
  const offers = req.offers ?? []
  if (offers.length === 0 && !hasStock(req.physicalMedia)) {
    return { ok: false, errors: ["List at least one custom offer, or sell physical media."] }
  }
  const errors = offers
    .filter((o) => !known.definitionIds.has(o.definitionId))
    .map((o) => `Unknown item "${o.definitionId}"`)
  if (errors.length > 0) return { ok: false, errors }
  const warnings =
    req.physicalMedia && known.physicalMedia ? binWarnings(req.physicalMedia, known.physicalMedia) : []
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true }
}

function binWarnings(stock: PhysicalMediaStock, known: PhysicalMediaAvailability): string[] {
  const warnings: string[] = []
  const picks = known.picks
  const picksStock = (picks?.available ?? 0) > 0
  if (stock.library) {
    if (known.derived === 0) {
      if (!picksStock) {
        warnings.push(
          "Records only sell in rooms on the Media Bridge with a local library; the van still stops",
        )
      }
    } else if (known.matching === 0) {
      warnings.push("No records in this room's library match; the van still stops")
    }
  }
  if (!picks) return warnings
  for (const [source, count] of Object.entries(picks.unavailableSources)) {
    const label = labelForMetadataSource(source)
    warnings.push(
      `${label} isn't available in this room; ${count} picked record${count === 1 ? "" : "s"} won't stock`,
    )
  }
  for (const album of picks.unresolved) {
    warnings.push(`Couldn't find ${album} in this room's library`)
  }
  return warnings
}

/** A bin's picks, registered before the bin is stocked (ADR 0216). */
export function picksOf(stock: PhysicalMediaStock | undefined): PhysicalMediaPick[] {
  return stock?.picks ?? []
}

function hasStock(stock: PhysicalMediaStock | undefined): boolean {
  return Boolean(stock && (stock.library || stock.picks?.length))
}

/** Resolve offers against registered definitions; `unknown` lists ids with no definition. */
export function resolveRoomShopOffers(
  offers: readonly RoomShopOffer[],
  definitions: readonly ItemDefinition[],
): { extras: ShoppingExtraOffer[]; unknown: string[] } {
  const byId = new Map(definitions.map((d) => [d.id, d]))
  const extras: ShoppingExtraOffer[] = []
  const unknown: string[] = []
  for (const offer of offers) {
    const definition = byId.get(offer.definitionId)
    if (!definition) {
      unknown.push(offer.definitionId)
      continue
    }
    extras.push({
      definition,
      basePrice: offer.basePrice ?? definition.coinValue ?? 0,
      ...(offer.stock ? { stock: offer.stock } : {}),
    })
  }
  return { extras, unknown }
}

/**
 * The composed shop a scoped round assigns. Its record bin comes from
 * `physicalMedia` (stocked by `withPhysicalMediaStock`, like any catalog
 * shop); offers are appended as extras.
 */
export function offersOnlyShop(
  scope: Pick<RoomShopScope, "scopeId" | "title" | "buybackRate" | "physicalMedia" | "openingMessage">,
): ItemShopsShopCatalogEntry {
  const rate = scope.buybackRate ?? 0
  const authored = scope.openingMessage
  return {
    shopId: `${ROOM_SHOP_ID_PREFIX}${scope.scopeId}`,
    name: scope.title ?? "Shop",
    openingMessage: authored ?? "{{shopName}} is open!",
    // The caller posts an authored line to the room. Skip the private DM so
    // chat doesn't also say "{{shopName}} is open!".
    ...(authored ? { postOpeningMessage: false } : {}),
    availableItems: [],
    ...(scope.physicalMedia ? { physicalMedia: scope.physicalMedia } : {}),
    listedBuybackRate: rate,
    unlistedBuybackRate: rate,
  }
}
