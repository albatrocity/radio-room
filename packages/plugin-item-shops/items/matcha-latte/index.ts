import type { TextEffectKind } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const MATCHA_FLAG = "matcha"

export const matchaTextEffect: TextEffectKind = {
  phase: "decorate",
  activeWhen: MATCHA_FLAG,
  effects: () => [{ type: "color", palette: "green", token: "fg" }],
}

export const matchaLatte = createItem({
  shortId: "matcha-latte",
  definition: {
    name: "Matcha Latte",
    description:
      "Earthy, calm, extremely green. Every word comes out green. Can be used on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 25,
    icon: "Leaf",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "matcha",
    effects: [
      { type: "flag", name: MATCHA_FLAG, value: true, intent: "neutral", durationMs: 600_000 },
    ],
    successMessage: "Matcha Latte sipped. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is sipping a Matcha Latte` : `${actor} bought ${target} a Matcha Latte`,
  }),
  textEffect: matchaTextEffect,
})
