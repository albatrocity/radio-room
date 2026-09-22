import { createItem } from "../shared/types"
import { stashLockFormFields, storeCoinsInContainer } from "../shared/storeInContainer"

export const merchCashBox = createItem({
  shortId: "merch-cash-box",
  definition: {
    name: "Merch Cash Box",
    description:
      "Lock away coins with a password. The box comes back empty when the last coin is taken. Anyone who knows the password can retrieve them from Storage.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    storageCapacity: 1,
    coinValue: 50,
    icon: "PiggyBank",
    rarity: "rare",
    useForm: [
      {
        name: "coinAmount",
        label: "Coins to store",
        type: "number",
        required: true,
        min: 1,
        integer: true,
        maxFrom: "coinBalance",
        placeholder: "1",
      },
      ...stashLockFormFields,
    ],
  },
  use: storeCoinsInContainer(),
})
