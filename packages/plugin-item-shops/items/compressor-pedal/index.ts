import { SHRINK_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const compressorPedal = createItem({
  shortId: "compressor-pedal",
  definition: {
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
  use: timedModifierEffect({
    modifierName: "compressor",
    flag: SHRINK_FLAG,
    intent: "negative",
    successMessage: "Compressor engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is compressed` : `${target} has been compressed`,
  }),
})
