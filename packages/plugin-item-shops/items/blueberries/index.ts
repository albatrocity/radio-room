import { Bluetooth } from "lucide-static"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"

const BLUE_LETTER_FLAG = "blue_letter"

const TOKEN_BY_STACK = { 1: "solid", 2: "focusRing", 3: "fg" } as const

export const BlueberryTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: BLUE_LETTER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[BLUE_LETTER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "." || ch === "," || ch === ":" || ch === "!" || ch === "?") {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "blue", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}





export const blueberries = createItem({
  shortId: "blueberries",
  definition: {
    name: "Blueberries",
    description: "They're so... blue.",
    stackable: true,
    maxStack: 2,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 5,
    icon: "HandCoins",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "blueberries",
    effects: [
      { type: "flag", name: BLUE_LETTER_FLAG, value: true, intent: "positive", durationMs: 600000 },
    ],
    successMessage: "Blueberries activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} ate some Blueberries!` : `${actor} fed some Blueberries to ${target}!`,
  }),
  textEffect: BlueberryTextEffect
})
