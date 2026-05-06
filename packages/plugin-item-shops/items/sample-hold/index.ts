import { SCRAMBLE_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const sampleHold = createItem({
  shortId: "sample-hold",
  definition: {
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
  use: timedModifierEffect({
    modifierName: "sample-hold",
    flag: SCRAMBLE_FLAG,
    intent: "negative",
    successMessage: "Sample & Hold engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is randomized` : `${target} is randomized`,
  }),
})
