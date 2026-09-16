import { createItem } from "../shared/types"
import { storeInContainer } from "../shared/storeInContainer"

export const vanCubby = createItem({
  shortId: "van-cubby",
  definition: {
    name: "Van Cubby",
    description:
      "A one-slot hideaway. Lock an item with a password — the cubby comes back when the stash is emptied. Anyone who knows the password can open it from Storage.",
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
