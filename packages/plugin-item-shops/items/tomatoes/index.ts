import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"

const RED_LETTER_FLAG = "red_letter"

const TOKEN_BY_STACK = { 1: "border", 2: "focusRing", 3: "solid" } as const

export const RedLetterTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: RED_LETTER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[RED_LETTER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "o" || ch === "O") {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "red", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}







export const tomatoes = createItem({
  shortId: "tomatoes",
  definition: {
    name: "Tomatoes",
    description: "'O' goodness! They are so ripe and red",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 15,
    icon: "Circle",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "tomatoes",
    effects: [
      { type: "flag", name: RED_LETTER_FLAG, value: true, intent: "neutral", durationMs: 300000 },
    ],
    successMessage: "Tomatoes activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} used Tomatoes on themselves` : `${actor} used Tomatoes on ${target}`,
  }),
})
