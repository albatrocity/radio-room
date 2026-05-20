import { CHAT_BUFFER_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const bufferPedal = createItem({
  shortId: "buffer-pedal",
  definition: {
    name: "Buffer Pedal",
    description:
      "Delays chat messages before they                            send. Each usage increases the delay by 1 second. Use on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 30,
    icon: "Timer",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "buffer_pedal",
    effects: [
      {
        type: "flag",
        name: CHAT_BUFFER_FLAG,
        value: true,
        intent: "negative",
        durationMs: 300_000,
      },
    ],
    successMessage: "Buffer Pedal engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf
        ? `${actor}'s messages are running through a Buffer Pedal. Delivery will be delayed.`
        : `${actor} routed ${target}'s chat through a Buffer Pedal. Delivery will be delayed.`,
  }),
})
