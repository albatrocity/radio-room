import { COMIC_SANS_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const jokerPedal = createItem({
  shortId: "joker-pedal",
  definition: {
    name: "Joker Pedal",
    description:
      "Makes chat messages appear in Comic Sans for a limited time. Use on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 50,
    icon: "laugh",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "joker_pedal",
    flag: COMIC_SANS_FLAG,
    intent: "negative",
    successMessage: "Joker Pedal engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is in Comic Sans` : `${target}'s chat is in Comic Sans`,
  }),
})
