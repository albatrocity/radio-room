import type { ItemDefinition, RoomShopOffer, ValidateShopRequest, ValidateShopResult } from "@repo/types"
import {
  ROOM_SHOP_ID_PREFIX,
  type ItemShopsShopCatalogEntry,
  type ShoppingExtraOffer,
} from "@repo/plugin-base"
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
  /** Custom offers (D14) re-resolved for late joiners. */
  offers?: RoomShopOffer[]
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

/** Shop ids plus custom offers; offers alone are a valid room shop. */
export function validateRoomShopRequest(
  req: ValidateShopRequest,
  known: {
    shopIds: ReadonlySet<string>
    availableShopIds?: ReadonlySet<string>
    definitionIds: ReadonlySet<string>
  },
): ValidateShopResult {
  const shopIds = req.shopIds ?? []
  const offers = req.offers ?? []
  if (shopIds.length === 0 && offers.length === 0) {
    return { ok: false, errors: ["List at least one shop id or custom offer."] }
  }
  const offerErrors = offers
    .filter((o) => !known.definitionIds.has(o.definitionId))
    .map((o) => `Unknown item "${o.definitionId}"`)
  if (shopIds.length === 0) {
    return offerErrors.length > 0 ? { ok: false, errors: offerErrors } : { ok: true }
  }
  const shops = validateRoomShopIds(shopIds, known.shopIds, known.availableShopIds)
  if (!shops.ok) return { ok: false, errors: [...shops.errors, ...offerErrors] }
  if (offerErrors.length > 0) return { ok: false, errors: offerErrors }
  return shops
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

/** The shop a round assigns when the scope has offers but no catalog shops. */
export function offersOnlyShop(scope: Pick<RoomShopScope, "scopeId" | "title">): ItemShopsShopCatalogEntry {
  return {
    shopId: `${ROOM_SHOP_ID_PREFIX}${scope.scopeId}`,
    name: scope.title ?? "Shop",
    openingMessage: "{{shopName}} is open!",
    availableItems: [],
    listedBuybackRate: 0,
    unlistedBuybackRate: 0,
  }
}
