import { GROW_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const boostPedal = createItem({
  shortId: "boost-pedal",
  definition: {
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
  use: timedModifierEffect({
    modifierName: "boost",
    flag: GROW_FLAG,
    intent: "positive",
    successMessage: "Boost engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is boosted` : `${target} is boosted`,
  }),
})
