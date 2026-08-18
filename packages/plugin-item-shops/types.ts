import { z } from "zod"
import { SHOP_CATALOG } from "./shops"
import {
  DEFAULT_LOCAL_LIBRARY_GRANTS,
  localLibraryGrantConfigSchema,
  physicalMediaOverrideSchema,
} from "./localLibrary/config"
import { defaultEnabledShopIds } from "./localLibrary/catalog"

export {
  DEFAULT_LOCAL_LIBRARY_GRANTS,
  localLibraryGrantConfigSchema,
  physicalMediaOverrideSchema,
  type LocalLibraryGrantConfig,
  type PhysicalMediaOverride,
} from "./localLibrary/config"

export const itemShopsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * When a shopping round is active and someone joins the room, assign them a shop immediately.
   */
  assignShopOnJoin: z.boolean().default(true),
  /**
   * Shops eligible for random assignment when starting or joining a shopping session.
   * Stale ids not in the effective catalog are ignored at runtime (see `getEligibleShops`).
   */
  enabledShopIds: z.array(z.string()).default(() => defaultEnabledShopIds()),
  /**
   * Extra operator-authored Local library grants (optional playlist shelves).
   * Physical Media is derived from Navidrome; Library Card is a static item.
   */
  localLibraryGrants: z
    .array(localLibraryGrantConfigSchema)
    .default(() => [...DEFAULT_LOCAL_LIBRARY_GRANTS]),
  /**
   * When a Local track from a derived Physical Media playlist is now playing
   * or queued, show the sleeve/case overlay. Missing playlist cover falls back
   * to track art.
   */
  showPhysicalMediaFrameInNowPlaying: z.boolean().default(false),
  /**
   * Per-playlist overrides for derived Physical Media (name, price, rarity, icon).
   */
  physicalMediaOverrides: z.array(physicalMediaOverrideSchema).default([]),
})

export type ItemShopsConfig = z.infer<typeof itemShopsConfigSchema>

export const defaultItemShopsConfig: ItemShopsConfig = {
  enabled: false,
  assignShopOnJoin: true,
  enabledShopIds: defaultEnabledShopIds(),
  localLibraryGrants: [...DEFAULT_LOCAL_LIBRARY_GRANTS],
  physicalMediaOverrides: [],
  showPhysicalMediaFrameInNowPlaying: false,
}
