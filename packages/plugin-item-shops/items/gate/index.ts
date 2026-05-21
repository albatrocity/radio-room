import type { TextEffectKind } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const GATE_FLAG = "gate"

const gateTextEffect: TextEffectKind = {
  phase: "word",
  activeWhen: GATE_FLAG,
  transform: (word) => word.replace(/[a-z]/g, "\\_"),
}

export const gate = createItem({
  shortId: "gate",
  definition: {
    name: "Gate",
    description:
      "SPEAK UP! REPLACES LOWERCASE LETTERS WITH __________",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 35,
    icon: "Fence",
    rarity: "rare",
  },
  use: timedModifierEffect({
    modifierName: "gate",
    effects: [
      { type: "flag", name: GATE_FLAG, value: true, intent: "negative", durationMs: 300_000 },
    ],
    successMessage: "Gate engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) => (isSelf ? `${actor} IS GATED AND HAS TO SPEAK UP TO BE HEARD.` : `${target} IS GATED BY ${actor}'s GATE PEDAL. SPEAK LOUDLY TO BE HEARD.`),
  }),
  textEffect: gateTextEffect,
})
