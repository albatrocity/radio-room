import { Tag, TagRootProps, type ConditionalValue } from "@chakra-ui/react"
import { ItemRarity } from "@repo/types"
import { getItemRarityColorPalette } from "../../lib/itemRarityPalette"

/** Theme-extended tag size (`tagRecipe` adds `xs`). */
type ItemRarityTagSize = "xs" | "sm" | "md" | "lg" | "xl"

type ItemRarityTagProps = {
  rarity: ItemRarity
  size?: ConditionalValue<ItemRarityTagSize>
} & Omit<TagRootProps, "colorPalette" | "size">

export function ItemRarityTag({ rarity, size = "sm", ...props }: ItemRarityTagProps) {
  return (
    <Tag.Root
      colorPalette={getItemRarityColorPalette(rarity)}
      variant="subtle"
      size={size as TagRootProps["size"]}
      {...props}
    >
      <Tag.Label>{rarity.charAt(0).toUpperCase() + rarity.slice(1)}</Tag.Label>
    </Tag.Root>
  )
}
