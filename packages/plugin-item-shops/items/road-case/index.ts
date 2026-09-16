import { createItem } from "../shared/types"
import { storeInContainer } from "../shared/storeInContainer"

export const roadCase = createItem({
  shortId: "road-case",
  definition: {
    name: "Road Case",
    description:
      "Three slots of touring luggage. Lock items with a password, retrieve them from Storage. Reusable.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "inventoryItems",
    storageCapacity: 3,
    coinValue: 100,
    icon: "Package",
    rarity: "legendary",
  },
  use: storeInContainer(),
})
