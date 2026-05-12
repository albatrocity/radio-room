import { createItem } from "../shared/types"
import { marsEggSellbackValue } from "./sellbackValue"

export { marsEggSellbackValue } from "./sellbackValue"

export const marsEgg = createItem({
  shortId: "mars-egg",
  definition: {
    name: "Mars Egg",
    description: "Appreciates in value the longer you hold it. Sell to collect coins.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 50,
    icon: "Egg",
    rarity: "legendary",
  },
  sellbackValue: marsEggSellbackValue,
})
