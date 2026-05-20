import { Tag, TagRootProps } from "@chakra-ui/react"
import { ItemRarity } from "@repo/types"
import { getItemRarityColorPalette } from "../../lib/itemRarityPalette"

type ItemRarityTagProps = { rarity: ItemRarity } & Omit<TagRootProps, "colorPalette">

export function ItemRarityTag({ rarity, size = "sm", ...props }: ItemRarityTagProps) {
  return (
    <Tag.Root
      colorPalette={getItemRarityColorPalette(rarity)}
      variant="subtle"
      size={size}
      {...props}
    >
      <Tag.Label>{rarity.charAt(0).toUpperCase() + rarity.slice(1)}</Tag.Label>
    </Tag.Root>
  )
}
