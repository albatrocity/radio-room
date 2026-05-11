import { ANONYMOUS_ACTIONS_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const FIVE_MIN_MS = 5 * 60 * 1000

export const skiMask = createItem({
  shortId: "ski-mask",
  definition: {
    name: "Ski Mask",
    description:
      "For a few minutes, room-visible item actions show as “Someone” instead of your name — handy before a Scratched CD if you want the skip without the spotlight.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 10,
    icon: "EyeOff",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "ski-mask",
    effects: [
      {
        type: "flag",
        name: ANONYMOUS_ACTIONS_FLAG,
        value: true,
        intent: "positive",
        durationMs: FIVE_MIN_MS,
      },
    ],
    successMessage: "Low profile engaged. It was lost with use.",
    describe: () => `Someone went anonymous`,
  }),
})
