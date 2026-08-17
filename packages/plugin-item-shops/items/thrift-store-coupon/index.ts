import type { ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"

export const THRIFT_STORE_COUPON_SHORT_ID = "thrift-store-coupon"

export const thriftStoreCoupon = createItem({
  shortId: THRIFT_STORE_COUPON_SHORT_ID,
  localLibraryGrant: { scope: "library" },
  definition: {
    name: "Thrift Store Coupon",
    description:
      "Legendary full-library pass. Keep it in your inventory, then open Add to Queue and pick any Library track — spent when the song is added.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 100,
    icon: "Ticket",
    rarity: "legendary",
  },
  use: async (): Promise<ItemUseResult> => ({
    success: false,
    consumed: false,
    message:
      "Keep this coupon in your inventory. Open Add to Queue and pick a Library track — it's spent when the song is added.",
  }),
})
