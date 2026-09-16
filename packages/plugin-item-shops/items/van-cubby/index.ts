import { createItem } from "../shared/types"
import { storeInContainer } from "../shared/storeInContainer"

export const vanCubby = createItem({
  shortId: "van-cubby",
  definition: {
    name: "Van Cubby",
    description:
      "Stash one item in password-protected storage. Retrievable via password, works across shows. Reusable.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "inventoryItems",
    storageCapacity: 1,
    coinValue: 50,
    icon: "Archive",
    rarity: "rare",
  },
  use: storeInContainer(),
})
