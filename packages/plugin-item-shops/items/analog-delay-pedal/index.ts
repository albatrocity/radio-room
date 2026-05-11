import { ECHO_FLAG } from "../textEffects/sizeShift"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const analogDelayPedal = createItem({
  shortId: "analog-delay-pedal",
  definition: {
    name: "Delay Pedal",
    description:
      "Echoes Echoes every every word word in in a a user's user's chat chat messages messages for for a a limited limited time. time. Use Use on on yourself yourself or or others. others",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 25,
    icon: "SquareStack",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "analog_delay_echo",
    effects: [
      { type: "flag", name: ECHO_FLAG, value: true, intent: "negative", durationMs: 300_000 },
    ],
    successMessage: "Analog Delay Pedal engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is hearing echoes` : `${target}'s chat echoes from ${actor}'s Delay Pedal!`,
  }),
})
