import type { TextEffectKind } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const JOKER_FLAG = "joker"

const jokerTextEffect: TextEffectKind = {
  phase: "decorate",
  activeWhen: JOKER_FLAG,
  order: 1,
  effects: () => [{ type: "font", value: "comicSans" }],
}

export const jokerPedal = createItem({
  shortId: "joker-pedal",
  definition: {
    name: "Joker Pedal",
    description:
      "Ha ha! What a funny looking pedal. Use on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 20,
    icon: "Laugh",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "joker_pedal",
    effects: [
      { type: "flag", name: JOKER_FLAG, value: true, intent: "negative", durationMs: 300_000 },
    ],
    successMessage: "Joker Pedal engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is talking kinda funny...` : `${target} is talking kinda funny...`,
  }),
  textEffect: jokerTextEffect,
})
