import { GATE_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const gate = createItem({
  shortId: "gate",
  definition: {
    name: "Gate",
    description:
      "REPLACES LOWERCASE LETTERS WITH __________",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 50,
    icon: "Fence",
    rarity: "uncommon",
  },
  use: timedModifierEffect({
    modifierName: "gate",
    effects: [
      { type: "flag", name: GATE_FLAG, value: true, intent: "negative", durationMs: 300_000 },
    ],
    successMessage: "Gate engaged. It was lost with use.",
    describe: ({ isSelf, actor, target }) => (isSelf ? `${actor} IS GATED AND HAS TO SPEAK UP TO BE HEARD.` : `${target} IS GATED BY ${actor}'s GATE PEDAL. SPEAK LOUDLY TO BE HEARD.`),
  }),
})
