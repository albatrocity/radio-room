import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"

const PINK_LETTER_FLAG = "pink_flag"

const TOKEN_BY_STACK = { 1: "fg", 2: "focusRing", 3: "solid" } as const

export const PinkLetterTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: PINK_LETTER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[PINK_LETTER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "e" || ch === "E") {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "pink", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}

export const lychees = createItem({
  shortId: "lychees",
  definition: {
    name: "Lychees",
    description: "Eee! Pink!",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 15,
    icon: "Laugh",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "lychees",
    effects: [
      { type: "flag", name: PINK_LETTER_FLAG, value: true, intent: "neutral", durationMs: 300000 },
    ],
    successMessage: "Lychees activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} used Lychees on themselves` : `${actor} used Lychees on ${target}`,
  }),
  textEffect: PinkLetterTextEffect
})
