import { Tag, TagRootProps } from "@chakra-ui/react"
import { ItemRarity } from "@repo/types"

type ItemRarityTagProps = { rarity: ItemRarity } & Omit<TagRootProps, "colorScheme">

export function ItemRarityTag({ rarity, ...props }: ItemRarityTagProps) {
  const color = getRarityColor(rarity)

  return (
    <Tag.Root colorScheme={color} {...props}>
      <Tag.Label>{rarity.charAt(0).toUpperCase() + rarity.slice(1)}</Tag.Label>
    </Tag.Root>
  )
}

function getRarityColor(rarity: ItemRarity): TagRootProps["colorScheme"] {
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
