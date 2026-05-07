import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const cateredMeal = createItem({
  shortId: "catered-meal",
  definition: {
    name: "Catered Meal",
    description: "Holding this prevents a track of yours from being demoted in the queue one time.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 75,
    icon: "hand-platter",
    rarity: "rare",
    defense: {
      targeting: { intents: ["negative"] },
      scope: ["queue"],
    },
  },
  /** Passive queue defense — activation explains why it does not consume. */
  use: usePassiveDefenseItem,
})
