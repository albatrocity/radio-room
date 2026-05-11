import { ANONYMOUS_ACTIONS_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const FIVE_MIN_MS = 5 * 60 * 1000

export const disguise = createItem({
  shortId: "disguise",
  definition: {
    name: "Disguise",
    description:
      "For a limited time, room-visible item actions show as “Someone” instead of your name.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 10,
    icon: "HatGlasses",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "disguise",
    visibility: "self",
    effects: [
      {
        type: "flag",
        name: ANONYMOUS_ACTIONS_FLAG,
        value: true,
        intent: "neutral",
        durationMs: FIVE_MIN_MS,
      },
    ],
    successMessage: "You donned a disguise. It was lost with use.",
    describe: () => `Someone went anonymous`,
  }),
})
