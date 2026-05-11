import type { TextEffectKind } from "@repo/plugin-base"
import { applyScrambleTransform } from "@repo/plugin-base"
import { SCRAMBLE_FLAG } from "../textEffects/textEffectFlags"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const scrambleTextEffect: TextEffectKind = {
  phase: "content",
  activeWhen: SCRAMBLE_FLAG,
  transform: (content, stacks) =>
    applyScrambleTransform(content, stacks[SCRAMBLE_FLAG] ?? 0),
}

export const sampleHold = createItem({
  shortId: "sample-hold",
  definition: {
    name: "Sample & Hold",
    description: "aslmrecbS athc smgessea rfo a miidetl mite. esU on osrefyul ro oestrh.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 50,
    icon: "Dices",
    rarity: "legendary",
  },
  use: timedModifierEffect({
    modifierName: "sample-hold",
    effects: [
      { type: "flag", name: SCRAMBLE_FLAG, value: true, intent: "negative", durationMs: 300_000 },
    ],
    successMessage: "Sample & Hold engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} is feeling lal mxide up...` : `${target} is feeling all mxied up from ${actor}'s Sample & Hold Pedal`,
  }),
  textEffect: scrambleTextEffect,
})
