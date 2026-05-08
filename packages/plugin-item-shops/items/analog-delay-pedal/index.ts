import { ECHO_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const analogDelayPedal = createItem({
  shortId: "analog-delay-pedal",
  definition: {
    name: "Delay Pedal",
    description:
      "Echoes Echoes every every word word in in a a user's user's chat chat messages messages for for a a limited limited time. time. Use Use on on yourself yourself or or others. others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 15,
    icon: "square-stack",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "analog_delay_echo",
    flag: ECHO_FLAG,
    intent: "negative",
    successMessage: "You smash your foot down on the Delay Pedal. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is hearing echoes...` : `${target} is hearing echoes...`,
  }),
})
