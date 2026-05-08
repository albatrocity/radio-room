import { INTERFACE_SATURATE_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const tubeOverdrive = createItem({
  shortId: "tube-overdrive",
  definition: {
    name: "Tube Overdrive",
    description:
      "Pushes the room UI into heavy saturation for a limited time — colors feel hotter and more vivid. Use on yourself or others; stacks crank it further.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 27,
    icon: "Gauge",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "interface_saturate",
    effects: [
      {
        type: "flag",
        name: INTERFACE_SATURATE_FLAG,
        value: true,
        intent: "positive",
        durationMs: 30000,
      },
    ],
    successMessage: "Tube overdrive engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor}'s colors are slamming` : `${target}'s colors are slamming`,
  }),
})
