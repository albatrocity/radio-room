import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const warranty = createItem({
  shortId: "warranty",
  definition: {
    name: "Warranty",
    description: "Holding this prevents debuffs from the next attack. Lost on use.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 60,
    icon: "badge-check",
    rarity: "uncommon",
    defense: {
      targeting: {
        intents: ["negative"],
        sourcePlugins: ["item-shops"],
      },
      scope: ["modifier"],
    },
  },
  /** Passive modifier defense — activation explains why it does not consume. */
  use: usePassiveDefenseItem,
})
