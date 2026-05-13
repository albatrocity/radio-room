import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"

const GREEN_LETTER_FLAG = "greenpeas"

const TOKEN_BY_STACK = { 1: "fg", 2: "focusRing", 3: "solid" } as const

export const GreenLetterTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: GREEN_LETTER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[GREEN_LETTER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "p" || ch === "P") {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "green", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}

export const greenPeas = createItem({
  shortId: "green-peas",
  definition: {
    name: "Green Peas",
    description: "Green 'P's...",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 15,
    icon: "HandCoins",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "green-peas",
    effects: [
      { type: "flag", name: GREEN_LETTER_FLAG, value: true, intent: "neutral", durationMs: 300000 },
    ],
    successMessage: "Green Peas activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} used Green Peas on themselves` : `${actor} used Green Peas on ${target}`,
  }),
  textEffect: GreenLetterTextEffect
})
