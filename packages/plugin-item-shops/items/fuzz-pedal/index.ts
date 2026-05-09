import { INTERFACE_BLUR_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const fuzzPedal = createItem({
  shortId: "fuzz-pedal",
  definition: {
    name: "Fuzz Pedal",
    description:
      "Adds a stackable interface blur for a limited time. Use on yourself or others — each use stacks more blur until it wears off.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 25,
    icon: "ZodiacAquarius",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "interface_blur",
    effects: [
      {
        type: "flag",
        name: INTERFACE_BLUR_FLAG,
        value: true,
        intent: "negative",
        durationMs: 30000,
      },
    ],
    successMessage: "Fuzz pedal engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor}'s screen is fuzzed out!!` : `${target}'s screen is fuzzed out from ${actor}'s Fuzz Pedal!`,
  }),
})
