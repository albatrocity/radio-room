import type { ItemRarity } from "@repo/types"

/** Chakra `colorPalette` values for item rarity (tags, icons, badges). */
export const ITEM_RARITY_COLOR_PALETTE = {
  common: "gray",
  uncommon: "green",
  rare: "blue",
  legendary: "purple",
} as const satisfies Record<ItemRarity, string>

export type ItemRarityColorPalette =
  (typeof ITEM_RARITY_COLOR_PALETTE)[keyof typeof ITEM_RARITY_COLOR_PALETTE]

export function getItemRarityColorPalette(rarity: ItemRarity): ItemRarityColorPalette {
  return ITEM_RARITY_COLOR_PALETTE[rarity]
}

/** Semantic token for rarity-colored icons inside a `colorPalette` scope. */
export const itemRarityIconColor = "colorPalette.fg" as const
