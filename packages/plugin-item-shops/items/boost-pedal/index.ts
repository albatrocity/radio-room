import { GROW_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const boostPedal = createItem({
  shortId: "boost-pedal",
  definition: {
    name: "Boost Pedal",
    description: "Makes chat messages BIG for a limited time. Use on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 10,
    icon: "ChevronsUp",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "boost",
    effects: [
      { type: "flag", name: GROW_FLAG, value: true, intent: "positive", durationMs: 300_000 },
    ],
    successMessage: "Boost engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} turned themselves up a little louder.` : `${actor}'s Boost Pedal turned ${target} up a little louder. `,
  }),
})
