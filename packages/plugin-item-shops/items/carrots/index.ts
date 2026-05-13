import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"

export const ORANGE_LETTER_FLAG = "orange_letter"

const TOKEN_BY_STACK = { 1: "border", 2: "focusRing", 3: "solid" } as const

export const orangeLetterTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: ORANGE_LETTER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[ORANGE_LETTER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "i" || ch === "I") {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "orange", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}

export const carrots = createItem({
  shortId: "carrots",
  definition: {
    name: "Carrots",
    description: "They're good for your I's!",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 20,
    icon: "Carrot",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "carrots",
    effects: [
      {
        type: "flag",
        name: ORANGE_LETTER_FLAG,
        value: true,
        intent: "neutral",
        durationMs: 300000,
      },
    ],
    successMessage: "Crunch! Carrots eaten!",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} ate Carrots and improved their I' sight!` : `${actor} used Carrots on ${target} and improved their I' sight!`,
  }),
  textEffect: orangeLetterTextEffect,
})
