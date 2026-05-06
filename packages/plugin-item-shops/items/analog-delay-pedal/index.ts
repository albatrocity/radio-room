import { ECHO_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const analogDelayPedal = createItem({
  shortId: "analog-delay-pedal",
  definition: {
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
  use: timedModifierEffect({
    modifierName: "analog_delay_echo",
    flag: ECHO_FLAG,
    intent: "negative",
    successMessage: "Analog Delay Pedal engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is hearing echoes` : `${target}'s chat echoes`,
  }),
})
