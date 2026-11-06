import type { TextEffectKind } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const COFFEE_CAPS_FLAG = "coffee_caps"

export const coffeeCapsTextEffect: TextEffectKind = {
  phase: "word",
  activeWhen: COFFEE_CAPS_FLAG,
  transform: (word) => word.toUpperCase(),
}

export const coffee = createItem({
  shortId: "coffee",
  definition: {
    name: "Coffee",
    description:
      "A cup of gas station coffee. EVERYTHING COMES OUT IN CAPS. Can be used on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 25,
    icon: "Coffee",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "coffee-caps",
    effects: [
      { type: "flag", name: COFFEE_CAPS_FLAG, value: true, intent: "neutral", durationMs: 300_000 },
    ],
    successMessage: "Coffee downed. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf
        ? `${actor} slammed a Coffee and CAN'T STOP SHOUTING`
        : `${actor} handed ${target} a Coffee. ${target.toUpperCase()} IS WIDE AWAKE`,
  }),
  textEffect: coffeeCapsTextEffect,
})
