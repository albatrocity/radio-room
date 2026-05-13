import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"
import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"


export const CUCUMBER_FLAG = "cucumber"

const TOKEN_BY_STACK = { 1: "fg", 2: "focusRing", 3: "solid" } as const

export const CucumberTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: CUCUMBER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[CUCUMBER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "c" || ch === "C" ) {
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




export const cucumberSlices = createItem({
  shortId: "cucumber-slices",
  definition: {
    name: "Cucumber Slices",
    description: "C these? Light green!",
    stackable: true,
    maxStack: 2,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 15,
    icon: "Slice",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "cucumber-slices",
    effects: [
      { type: "flag", name: CUCUMBER_FLAG, value: true, intent: "neutral", durationMs: 300000 },
    ],
    successMessage: "Cucumber Slices activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} used Cucumber Slices on themselves` : `${actor} used Cucumber Slices on ${target}`,
  }),
  textEffect: CucumberTextEffect
})
