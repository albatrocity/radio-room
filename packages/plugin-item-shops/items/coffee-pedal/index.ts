import type { TextEffectKind } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const COFFEE_FLAG = "coffee"

const coffeeTextEffect: TextEffectKind = {
  phase: "word",
  activeWhen: COFFEE_FLAG,
  transform: (word) => word.replace(/[zZ]/g, "!"),
}

export const coffeePedal = createItem({
  shortId: "coffee-pedal",
  definition: {
    name: "Coffee Pedal",
    description: "Wake up and smell this Pedal! Replaces all Z's with exclamation points. Can be used on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 15,
    icon: "Coffee",
    rarity: "rare",
  },
  use: timedModifierEffect({
    modifierName: "coffee",
    effects: [
      { type: "flag", name: COFFEE_FLAG, value: true, intent: "positive", durationMs: 300000 },
    ],
    successMessage: "Coffee Pedal activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is feeling caffienated!` : `${actor} used Coffee Pedal... ${target} is feeling caffienated!`,
  }),
  textEffect: coffeeTextEffect,
})
