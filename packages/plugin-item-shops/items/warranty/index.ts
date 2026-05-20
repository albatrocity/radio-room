import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const warranty = createItem({
  shortId: "warranty",
  definition: {
    name: "Warranty",
    description:
      "Because anything can happen. Holding this prevents negative effects from the next attack. Lost after defense is triggered.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 20,
    icon: "BadgeCheck",
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
