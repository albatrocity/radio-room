import { createItem } from "../shared/types"
import { storeInContainer } from "../shared/storeInContainer"

export const trailer = createItem({
  shortId: "trailer",
  definition: {
    name: "Trailer",
    description:
      "Five slots on the hitch. Fill it over time — even across shows — then lock it with a password. The trailer comes back when the last thing is taken.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "inventoryItems",
    storageCapacity: 5,
    coinValue: 100,
    icon: "Truck",
    rarity: "legendary",
  },
  use: storeInContainer(),
})
