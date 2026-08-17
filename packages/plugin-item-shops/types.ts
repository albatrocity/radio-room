import { z } from "zod"
import { itemDefinitionAuthoringSchema } from "@repo/types"
import { SHOP_CATALOG } from "./shops"

/** Grant-only fields composed onto {@link itemDefinitionAuthoringSchema}. */
export const localLibraryGrantConfigSchema = itemDefinitionAuthoringSchema.extend({
  scope: z.enum(["library", "playlist"]),
  /** Navidrome playlist id when `scope` is `playlist`; ignored for `library`. */
  playlistId: z.string().default(""),
})

export type LocalLibraryGrantConfig = z.infer<typeof localLibraryGrantConfigSchema>

/**
 * Seeded former hard-coded Stickers + Coupon (same shortIds) so existing
 * inventories survive. Playlist ids start empty until ops configure them.
 */
export const DEFAULT_LOCAL_LIBRARY_GRANTS: LocalLibraryGrantConfig[] = [
  {
    shortId: "bargain-bin-sticker",
    name: "Bargain Bin Sticker",
    description:
      "Access to the Bargain Bin and the ability to queue one song from it: strange and unique tracks await.",
    icon: "Sticker",
    stackable: true,
    maxStack: 5,
    tradeable: true,
    consumable: false,
    coinValue: 15,
    rarity: "common",
    scope: "playlist",
    playlistId: "",
  },
  {
    shortId: "library-card",
    name: "Library Card",
    description:
      "Somebody's old library card. Gives you complete access to the Library and the ability to queue one song from it.",
    icon: "IdCard",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 100,
    rarity: "legendary",
    scope: "library",
    playlistId: "",
  },
]

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
  /**
   * Config-driven Local library grant SKUs (full library or playlist shelf).
   * Auto-stocked on Thrift Store when the room uses the Media Bridge.
   */
  localLibraryGrants: z
    .array(localLibraryGrantConfigSchema)
    .default(() => [...DEFAULT_LOCAL_LIBRARY_GRANTS]),
})

export type ItemShopsConfig = z.infer<typeof itemShopsConfigSchema>

export const defaultItemShopsConfig: ItemShopsConfig = {
  enabled: false,
  assignShopOnJoin: true,
  enabledShopIds: SHOP_CATALOG.map((s) => s.shopId),
  localLibraryGrants: [...DEFAULT_LOCAL_LIBRARY_GRANTS],
}
