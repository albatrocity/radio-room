import { z } from "zod"
import { SHOP_CATALOG } from "./shops"

export const itemShopsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * When a shopping round is active and someone joins the room, assign them a shop immediately.
   */
  assignShopOnJoin: z.boolean().default(true),
  /**
   * Shops eligible for random assignment when starting or joining a shopping session.
   * Stale ids not in `SHOP_CATALOG` are ignored at runtime (see `getEligibleShops` in the plugin).
   */
  enabledShopIds: z.array(z.string()).default(() => SHOP_CATALOG.map((s) => s.shopId)),
})

export type ItemShopsConfig = z.infer<typeof itemShopsConfigSchema>

export const defaultItemShopsConfig: ItemShopsConfig = {
  enabled: false,
  assignShopOnJoin: true,
  enabledShopIds: SHOP_CATALOG.map((s) => s.shopId),
}
