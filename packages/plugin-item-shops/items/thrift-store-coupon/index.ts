import type { ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"

export const THRIFT_STORE_COUPON_SHORT_ID = "thrift-store-coupon"

export const thriftStoreCoupon = createItem({
  shortId: THRIFT_STORE_COUPON_SHORT_ID,
  definition: {
    name: "Thrift Store Coupon",
    description: "Grants access to the Thrift Store Library, allowing one song to be queued.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 20,
    icon: "Ticket",
    rarity: "uncommon",
  },
  use: async (): Promise<ItemUseResult> => ({
    success: false,
    consumed: false,
    message:
      "Keep this coupon in your inventory. Open Add to Queue and pick a Library track — it's spent when the song is added.",
  }),
})
