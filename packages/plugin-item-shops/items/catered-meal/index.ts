import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const cateredMeal = createItem({
  shortId: "catered-meal",
  definition: {
    name: "Catered Meal",
    description: "Looks like some kind of pasta. Protects one of your tracks from being demoted in the queue, once.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 25,
    icon: "HandPlatter",
    rarity: "common",
    defense: {
      targeting: { intents: ["negative"] },
      scope: ["queue"],
    },
  },
  /** Passive queue defense — activation explains why it does not consume. */
  use: usePassiveDefenseItem,
})
