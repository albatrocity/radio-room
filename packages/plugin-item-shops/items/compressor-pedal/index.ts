import { SHRINK_FLAG } from "../textEffects/textEffectFlags"
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
    coinValue: 10,
    icon: "Shrink",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "compressor",
    effects: [
      { type: "flag", name: SHRINK_FLAG, value: true, intent: "negative", durationMs: 300_000 },
    ],
    successMessage: "Compressor engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is compressed` : `${target} has been compressed`,
  }),
})
