import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const PUBLIC_LIBRARY_SHOP_ID = "public-library"

/** Bridge-only shop stocking the Library Card. */
export const PUBLIC_LIBRARY_SHOP: ItemShopsShopCatalogEntry = {
  shopId: PUBLIC_LIBRARY_SHOP_ID,
  name: "Public Library",
  openingMessage: "Quiet, please. Check out a Library Card and borrow one track from the stacks.",
  requiresPlaybackControllerId: "bridge",
  availableItems: [{ shortId: items.libraryCard.shortId, coinValue: 100 }],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
