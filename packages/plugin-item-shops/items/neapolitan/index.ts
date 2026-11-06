import type { TextEffectKind } from "@repo/plugin-base"
import type { TextEffect } from "@repo/types"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const NEAPOLITAN_FLAG = "neapolitan"

/** Vanilla, chocolate, strawberry. */
const FLAVORS: readonly TextEffect[] = [
  { type: "color", palette: "yellow", token: "fg" },
  { type: "color", palette: "brown", token: "fg" },
  { type: "color", palette: "pink", token: "fg" },
]

export const neapolitanTextEffect: TextEffectKind = {
  phase: "decorate",
  activeWhen: NEAPOLITAN_FLAG,
  effects: (_stacks, ctx) => [FLAVORS[ctx.wordIndex % FLAVORS.length]!],
}

export const neapolitan = createItem({
  shortId: "neapolitan",
  definition: {
    name: "Neapolitan Ice Cream",
    description:
      "Vanilla, chocolate, strawberry. Words cycle through all three flavors. Can be used on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 10,
    icon: "IceCreamBowl",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "neapolitan",
    effects: [
      { type: "flag", name: NEAPOLITAN_FLAG, value: true, intent: "neutral", durationMs: 300_000 },
    ],
    successMessage: "Neapolitan Ice Cream eaten. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf
        ? `${actor} is working through a tub of Neapolitan`
        : `${actor} shared some Neapolitan with ${target}`,
  }),
  textEffect: neapolitanTextEffect,
})
