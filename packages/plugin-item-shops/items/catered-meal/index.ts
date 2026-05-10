import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const cateredMeal = createItem({
  shortId: "catered-meal",
  definition: {
    name: "Catered Meal",
    description: "Looks like some kind of pasta. Protects a track from being demoted, once.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 75,
    icon: "HandPlatter",
    rarity: "rare",
    defense: {
      targeting: { intents: ["negative"] },
      scope: ["queue"],
    },
  },
  /** Passive queue defense — activation explains why it does not consume. */
  use: usePassiveDefenseItem,
})
