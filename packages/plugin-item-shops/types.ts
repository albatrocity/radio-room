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
  /** Navidrome playlist id for Bargain Bin Sticker (`playlistKey: bargain-bin`). */
  playlistIdBargainBin: z.string().default(""),
  /** Navidrome playlist id for Out Of Print Sticker (`playlistKey: out-of-print`). */
  playlistIdOutOfPrint: z.string().default(""),
  /** Navidrome playlist id for Local Heroes Sticker (`playlistKey: local-heroes`). */
  playlistIdLocalHeroes: z.string().default(""),
  /** Navidrome playlist id for Unreleased Sticker (`playlistKey: unreleased`). */
  playlistIdUnreleased: z.string().default(""),
})

export type ItemShopsConfig = z.infer<typeof itemShopsConfigSchema>

export const defaultItemShopsConfig: ItemShopsConfig = {
  enabled: false,
  assignShopOnJoin: true,
  enabledShopIds: SHOP_CATALOG.map((s) => s.shopId),
  playlistIdBargainBin: "",
  playlistIdOutOfPrint: "",
  playlistIdLocalHeroes: "",
  playlistIdUnreleased: "",
}

/** Build the abstract playlistKey → Navidrome id map from flat admin config. */
export function localLibraryPlaylistsFromConfig(
  config: Pick<
    ItemShopsConfig,
    | "playlistIdBargainBin"
    | "playlistIdOutOfPrint"
    | "playlistIdLocalHeroes"
    | "playlistIdUnreleased"
  >,
): Record<string, string> {
  return {
    "bargain-bin": config.playlistIdBargainBin ?? "",
    "out-of-print": config.playlistIdOutOfPrint ?? "",
    "local-heroes": config.playlistIdLocalHeroes ?? "",
    unreleased: config.playlistIdUnreleased ?? "",
  }
}
