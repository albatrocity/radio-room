import type { TextEffectKind } from "@repo/plugin-base"
import type { TextSegment } from "@repo/types"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const CRUNCH_FLAG = "crunch"

/** Every other letter is bigger; the pattern depends only on the word, so re-renders match. */
export const crunchTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: CRUNCH_FLAG,
  build: (word) => {
    const chars = [...word]
    if (chars.length < 2) return null
    const out: TextSegment[] = []
    chars.forEach((ch, i) => {
      out.push(i % 2 === 1 ? { text: ch, effects: [{ type: "size", value: "lg" }] } : { text: ch })
    })
    return out
  },
}

export const potatoChips = createItem({
  shortId: "potato-chips",
  definition: {
    name: "Potato Chips",
    description: "CrUnChY. Every other letter comes out bigger. Can be used on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 10,
    icon: "Cookie",
    rarity: "common",
  },
  use: timedModifierEffect({
    modifierName: "potato-chips",
    effects: [
      { type: "flag", name: CRUNCH_FLAG, value: true, intent: "neutral", durationMs: 300_000 },
    ],
    successMessage: "Potato Chips eaten. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf
        ? `${actor} is crunching through a bag of Potato Chips`
        : `${actor} tossed ${target} a bag of Potato Chips`,
  }),
  textEffect: crunchTextEffect,
})
