import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"

export const SCRATCHED_CD_SHORT_ID = "scratched-cd"
export const ANALOG_DELAY_SHORT_ID = "analog-delay-pedal"
export const COMPRESSOR_SHORT_ID = "compressor-pedal"
export const BOOST_SHORT_ID = "boost-pedal"
export const GATE_SHORT_ID = "gate"
export const SAMPLE_HOLD_SHORT_ID = "sample-hold"
export const JOKER_PEDAL_SHORT_ID = "joker-pedal"
export const HUMMUS_VEGGIES_SHORT_ID = "hummus-veggies"
export const EMPTY_FRIDGE_SHORT_ID = "empty-fridge"
export const CATERED_MEAL_SHORT_ID = "catered-meal"
export const WARRANTY_SHORT_ID = "warranty"

/**
 * Master item catalog (prices, rarity, inventory flags). Shop-specific price
 * overrides live in `shops.ts`.
 */
export const ITEM_CATALOG: readonly ItemCatalogEntry[] = [
  {
    definition: {
      shortId: SCRATCHED_CD_SHORT_ID,
      name: "Scratched CD",
      description: "Skip the currently playing song instantly.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      coinValue: 100,
      icon: "disc-2",
      rarity: "rare",
    },
  },
  {
    definition: {
      shortId: ANALOG_DELAY_SHORT_ID,
      name: "Analog Delay Pedal",
      description:
        "Echoes every word in a user's chat messages for a limited time. Use on yourself or others.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "user",
      coinValue: 50,
      icon: "square-stack",
      rarity: "uncommon",
    },
  },
  {
    definition: {
      shortId: COMPRESSOR_SHORT_ID,
      name: "Compressor Pedal",
      description: "Makes chat messages very small for a limited time. Use on yourself or others.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "user",
      coinValue: 50,
      icon: "shrink",
      rarity: "common",
    },
  },
  {
    definition: {
      shortId: BOOST_SHORT_ID,
      name: "Boost Pedal",
      description: "Makes chat messages large for a limited time. Use on yourself or others.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "user",
      coinValue: 50,
      icon: "chevrons-up",
      rarity: "common",
    },
  },
  {
    definition: {
      shortId: GATE_SHORT_ID,
      name: "Gate",
      description:
        "Replaces lowercase letters with underscores for a limited time. Use on yourself or others.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "user",
      coinValue: 50,
      icon: "fence",
      rarity: "uncommon",
    },
  },
  {
    definition: {
      shortId: SAMPLE_HOLD_SHORT_ID,
      name: "Sample & Hold",
      description: "Scrambles chat messages for a limited time. Use on yourself or others.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "user",
      coinValue: 50,
      icon: "dices",
      rarity: "legendary",
    },
  },
  {
    definition: {
      shortId: JOKER_PEDAL_SHORT_ID,
      name: "Joker Pedal",
      description:
        "Makes chat messages appear in Comic Sans for a limited time. Use on yourself or others.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "user",
      coinValue: 50,
      icon: "laugh",
      rarity: "uncommon",
    },
  },
  {
    definition: {
      shortId: HUMMUS_VEGGIES_SHORT_ID,
      name: "Hummus & Veggies",
      description: "Move any song up 1 position in the queue.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "queueItem",
      coinValue: 50,
      icon: "salad",
      rarity: "rare",
    },
  },
  {
    definition: {
      shortId: EMPTY_FRIDGE_SHORT_ID,
      name: "Empty Fridge",
      description: "Move any song down 1 position in the queue.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      requiresTarget: "queueItem",
      coinValue: 50,
      icon: "refrigerator",
      rarity: "rare",
    },
  },
  {
    definition: {
      shortId: CATERED_MEAL_SHORT_ID,
      name: "Catered Meal",
      description:
        "Holding this prevents a track of yours from being demoted in the queue one time.",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: false,
      coinValue: 75,
      icon: "chef-hat",
      rarity: "rare",
      defense: {
        targeting: { intents: ["negative"] },
        scope: ["queue"],
      },
    },
  },
  {
    definition: {
      shortId: WARRANTY_SHORT_ID,
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
  },
]

export function getItemCatalogEntry(shortId: string): ItemCatalogEntry | undefined {
  return ITEM_CATALOG.find((e) => e.definition.shortId === shortId)
}
