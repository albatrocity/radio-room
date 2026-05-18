import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"

const LEMONS_FLAG = "lemons"

const TOKEN_BY_STACK = { 1: "solid", 2: "focusRing", 3: "solid" } as const

export const LemonsTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: LEMONS_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[LEMONS_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "a" || ch === "A" || ch === "d" || ch === "D" ) {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "yellow", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}





export const lemons = createItem({
  shortId: "lemons",
  definition: {
    name: "Lemons",
    description: "When life gives you lemons... make lemon A,D!",
    stackable: true,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 10,
    icon: "BadgeX",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "lemons",
    effects: [
      { type: "flag", name: LEMONS_FLAG, value: true, intent: "neutral", durationMs: 600000 },
    ],
    successMessage: "Lemons activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} ate some Lemons!` : `${actor} fed ${target} some Lemons!`,
  }),
  textEffect:LemonsTextEffect
})
