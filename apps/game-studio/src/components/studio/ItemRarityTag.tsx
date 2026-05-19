import { Tag, TagRootProps } from "@chakra-ui/react"
import type { ItemRarity } from "@repo/types"

type ItemRarityTagProps = { rarity: ItemRarity } & Omit<TagRootProps, "colorPalette">

export function ItemRarityTag({ rarity, ...props }: ItemRarityTagProps) {
  const colorPalette = getRarityPalette(rarity)

  return (
    <Tag.Root colorPalette={colorPalette} variant="subtle" size="sm" {...props}>
      <Tag.Label>{rarity.charAt(0).toUpperCase() + rarity.slice(1)}</Tag.Label>
    </Tag.Root>
  )
}

function getRarityPalette(rarity: ItemRarity): TagRootProps["colorPalette"] {
  switch (rarity) {
    case "common":
      return "gray"
    case "uncommon":
      return "green"
    case "rare":
      return "blue"
    case "legendary":
      return "purple"
  }
}
