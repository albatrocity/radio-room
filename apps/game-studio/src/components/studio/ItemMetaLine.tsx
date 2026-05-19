import { HStack, Text } from "@chakra-ui/react"
import type { ItemRarity } from "@repo/types"
import { ItemRarityTag } from "./ItemRarityTag"

export type ItemMetaLineProps = {
  rarity: ItemRarity
  price: number
  /** Optional trailing text (e.g. availability on buy offers). */
  suffix?: string
}

export function ItemMetaLine({ rarity, price, suffix }: ItemMetaLineProps) {
  return (
    <HStack gap="2" flexWrap="wrap">
      <ItemRarityTag rarity={rarity} />
      <Text fontSize="xs" color="fg.muted">
        {price} coins
        {suffix ? ` · ${suffix}` : null}
      </Text>
    </HStack>
  )
}
