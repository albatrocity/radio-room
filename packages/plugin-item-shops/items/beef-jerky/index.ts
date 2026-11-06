import { GROW_FLAG } from "../textEffects/flags"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const beefJerky = createItem({
  shortId: "beef-jerky",
  definition: {
    name: "Beef Jerky",
    description:
      "Pure protein. Your messages get swole: text goes up a size. Can be used on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 25,
    icon: "Beef",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "beef-jerky",
    effects: [
      { type: "flag", name: GROW_FLAG, value: true, intent: "positive", durationMs: 600_000 },
    ],
    successMessage: "Beef Jerky eaten. Gains incoming.",
    describe: ({ isSelf, actor, target }) =>
      isSelf
        ? `${actor} ate some Beef Jerky and is getting swole`
        : `${actor} fed ${target} Beef Jerky. ${target} is getting swole`,
  }),
})
