import { createItem } from "../shared/types"
import { stashLockFormFields, storeInContainer } from "../shared/storeInContainer"

export const trailer = createItem({
  shortId: "trailer",
  definition: {
    name: "Trailer",
    description:
      "Haul more gear. Five storage slots for saving items, event across shows. Secure it with a password. Reusable.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "inventoryItems",
    storageCapacity: 5,
    coinValue: 200,
    icon: "Truck",
    rarity: "legendary",
    useForm: [...stashLockFormFields],
  },
  use: storeInContainer(),
})
