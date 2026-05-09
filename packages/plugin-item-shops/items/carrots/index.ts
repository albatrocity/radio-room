import { CARROT_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const carrots = createItem({
  shortId: "carrots",
  definition: {
    name: "Carrots",
    description: "They're good for your I's!",
    stackable: true,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 10,
    icon: "Carrot",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "carrots",
    effects: [
      { type: "flag", name: CARROT_FLAG, value: true, intent: "neutral", durationMs: 300000 },
    ],
    successMessage: "Carrots activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} used Carrots on themselves` : `${actor} used Carrots on ${target}`,
  }),
})
