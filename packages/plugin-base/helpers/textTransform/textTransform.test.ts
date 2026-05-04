import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { GameStateModifier } from "@repo/types"
import {
  COMIC_SANS_FLAG,
  GATE_FLAG,
  SCRAMBLE_FLAG,
  countTextEffectStacks,
} from "./flags"
import { applyGateTransform, applyScrambleTransform } from "./effects"
import { applyTextEffects } from "./pipeline"

/**
 * Deterministic Math.random replacement: cycles through `values` so shuffles
 * and partitions are reproducible across test runs without coupling tests to
 * the exact internal call order.
 */
function seedRandom(values: number[]): void {
  let i = 0
  vi.spyOn(Math, "random").mockImplementation(() => {
    const v = values[i % values.length]!
    i += 1
    return v
  })
}

function isAlphaChar(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase()
}

function sortedChars(s: string): string {
  return Array.from(s).sort().join("")
}

function alphaCharsOf(s: string): string[] {
  return Array.from(s).filter(isAlphaChar)
}

function nonAlphaIndices(s: string): { index: number; ch: string }[] {
  const out: { index: number; ch: string }[] = []
  Array.from(s).forEach((ch, i) => {
    if (!isAlphaChar(ch)) out.push({ index: i, ch })
  })
  return out
}

describe("applyGateTransform", () => {
  test("replaces ASCII lowercase with Markdown-escaped underscores", () => {
    expect(applyGateTransform("hello")).toBe("\\_\\_\\_\\_\\_")
    expect(applyGateTransform("Hello")).toBe("H\\_\\_\\_\\_")
    expect(applyGateTransform("aBc123")).toBe("\\_B\\_123")
  })

  test("leaves punctuation and non-ASCII alone", () => {
    expect(applyGateTransform("café")).toBe("\\_\\_\\_é")
    expect(applyGateTransform("!!!")).toBe("!!!")
  })
})

describe("countTextEffectStacks gate", () => {
  test("counts gate flag stacks", () => {
    const now = 1000
    const modifiers: GameStateModifier[] = [
      {
        id: "m1",
        name: "g1",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: GATE_FLAG, value: true }],
      },
      {
        id: "m2",
        name: "g2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: GATE_FLAG, value: true }],
      },
    ]
    expect(countTextEffectStacks(modifiers, now)).toEqual({
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 2,
      scramble: 0,
      comicSans: 0,
    })
  })
})

describe("countTextEffectStacks scramble", () => {
  test("counts scramble flag stacks (one per modifier)", () => {
    const now = 1000
    const modifiers: GameStateModifier[] = [
      {
        id: "s1",
        name: "scramble1",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [
          { type: "flag", name: SCRAMBLE_FLAG, value: true },
          // Duplicate flag in same modifier still counts as 1 stack.
          { type: "flag", name: SCRAMBLE_FLAG, value: true },
        ],
      },
      {
        id: "s2",
        name: "scramble2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: SCRAMBLE_FLAG, value: true }],
      },
      {
        id: "expired",
        name: "scrambleX",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 500,
        effects: [{ type: "flag", name: SCRAMBLE_FLAG, value: true }],
      },
    ]
    expect(countTextEffectStacks(modifiers, now)).toEqual({
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 0,
      scramble: 2,
      comicSans: 0,
    })
  })
})

describe("countTextEffectStacks comicSans", () => {
  test("counts comic_sans flag stacks", () => {
    const now = 1000
    const modifiers: GameStateModifier[] = [
      {
        id: "c1",
        name: "joker",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: COMIC_SANS_FLAG, value: true }],
      },
    ]
    expect(countTextEffectStacks(modifiers, now)).toEqual({
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 0,
      scramble: 0,
      comicSans: 1,
    })
  })
})

describe("applyTextEffects gate", () => {
  test("gate-only returns masked content", () => {
    const result = applyTextEffects("Hello world", {
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 1,
      scramble: 0,
      comicSans: 0,
    })
    expect(result).not.toBeNull()
    expect(result!.content).toBe("H\\_\\_\\_\\_ \\_\\_\\_\\_\\_")
    expect(result!.contentSegments.map((s) => s.text).join("")).toBe(
      "H\\_\\_\\_\\_ \\_\\_\\_\\_\\_",
    )
  })

  test("gate combines with echo on masked words", () => {
    const result = applyTextEffects("Hi", {
      shrink: 0,
      grow: 0,
      echo: 1,
      gate: 1,
      scramble: 0,
      comicSans: 0,
    })
    expect(result!.content).toBe("H\\_ H\\_")
  })
})

describe("applyTextEffects comicSans", () => {
  test("comicSans-only adds font effect to word segments", () => {
    const result = applyTextEffects("hello", {
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 0,
      scramble: 0,
      comicSans: 1,
    })
    expect(result).not.toBeNull()
    expect(result!.content).toBe("hello")
    const withFont = result!.contentSegments.filter((s) => s.effects?.some((e) => e.type === "font"))
    expect(withFont.length).toBeGreaterThan(0)
    expect(
      withFont.every((s) => s.effects?.some((e) => e.type === "font" && e.value === "comicSans")),
    ).toBe(true)
  })
})

describe("applyScrambleTransform stack 1 (within-word)", () => {
  beforeEach(() => {
    seedRandom([0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6, 0.0, 0.95])
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("preserves length, word boundaries, and per-word letter multiset", () => {
    const input = "hello world"
    const out = applyScrambleTransform(input, 1)
    expect(out.length).toBe(input.length)
    const inputWords = input.split(" ")
    const outputWords = out.split(" ")
    expect(outputWords).toHaveLength(inputWords.length)
    for (let i = 0; i < inputWords.length; i++) {
      expect(sortedChars(outputWords[i]!)).toBe(sortedChars(inputWords[i]!))
    }
  })

  test("anchors digits and punctuation in their original word position", () => {
    const input = "abc1!d hi-2"
    const out = applyScrambleTransform(input, 2)
    // Stack 2 still preserves per-index non-alpha placement.
    expect(out.length).toBe(input.length)
    for (const { index, ch } of nonAlphaIndices(input)) {
      expect(out[index]).toBe(ch)
    }
    expect(sortedChars(alphaCharsOf(out).join(""))).toBe(
      sortedChars(alphaCharsOf(input).join("")),
    )
  })

  test("returns content unchanged with stacks <= 0", () => {
    expect(applyScrambleTransform("hello", 0)).toBe("hello")
    expect(applyScrambleTransform("hello", -1)).toBe("hello")
  })
})

describe("applyScrambleTransform stack 2 (pool, preserve word lengths)", () => {
  beforeEach(() => {
    seedRandom([0.05, 0.42, 0.81, 0.17, 0.63, 0.29, 0.74, 0.11, 0.55, 0.93, 0.36])
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("preserves total alpha multiset, word lengths, and non-alpha positions", () => {
    const input = "hello there friend!"
    const out = applyScrambleTransform(input, 2)
    expect(out.length).toBe(input.length)
    const inputWords = input.split(/(\s+)/)
    const outputWords = out.split(/(\s+)/)
    expect(outputWords).toHaveLength(inputWords.length)
    inputWords.forEach((w, i) => {
      expect(outputWords[i]!.length).toBe(w.length)
    })
    for (const { index, ch } of nonAlphaIndices(input)) {
      expect(out[index]).toBe(ch)
    }
    expect(sortedChars(alphaCharsOf(out).join(""))).toBe(
      sortedChars(alphaCharsOf(input).join("")),
    )
  })
})

describe("applyScrambleTransform stack 3+ (random word count and lengths)", () => {
  beforeEach(() => {
    // Sequence chosen so randInt(1, 4) picks a value > 2 (multi-word case),
    // and the partition produces non-trivial lengths.
    seedRandom([
      0.05, 0.42, 0.81, 0.17, 0.63, 0.29, 0.74, 0.11, 0.55, 0.93, 0.36, 0.62,
      0.18, 0.71, 0.04, 0.88,
    ])
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("preserves total alpha multiset", () => {
    const input = "hello world"
    const out = applyScrambleTransform(input, 3)
    expect(sortedChars(alphaCharsOf(out).join(""))).toBe(
      sortedChars(alphaCharsOf(input).join("")),
    )
  })

  test("emits one or more space-separated words", () => {
    const input = "hello world"
    const out = applyScrambleTransform(input, 3)
    const words = out.split(" ").filter((w) => w.length > 0)
    expect(words.length).toBeGreaterThanOrEqual(1)
    // Total non-whitespace chars preserved.
    expect(words.join("").length).toBe("helloworld".length)
  })

  test("returns content unchanged for whitespace-only input", () => {
    expect(applyScrambleTransform("   ", 3)).toBe("   ")
    expect(applyScrambleTransform("", 3)).toBe("")
  })
})

describe("applyTextEffects scramble", () => {
  beforeEach(() => {
    seedRandom([0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6, 0.0])
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("scramble-only returns segments equal to scrambled content", () => {
    const result = applyTextEffects("hello world", {
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 0,
      scramble: 1,
      comicSans: 0,
    })
    expect(result).not.toBeNull()
    // Joined segments equal the content string.
    expect(result!.contentSegments.map((s) => s.text).join("")).toBe(result!.content)
    // Same length and word boundaries as input (stack 1).
    expect(result!.content.length).toBe("hello world".length)
    const out = result!.content.split(" ")
    expect(out).toHaveLength(2)
  })

  test("scramble runs before gate (lowercase letters in the scrambled output are masked)", () => {
    const result = applyTextEffects("hi", {
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 1,
      scramble: 1,
      comicSans: 0,
    })
    expect(result).not.toBeNull()
    // "hi" scrambled in place is still 2 lowercase letters → both gated.
    expect(result!.content).toBe("\\_\\_")
  })

  test("scramble combines with echo: each scrambled word is echoed", () => {
    const result = applyTextEffects("ab", {
      shrink: 0,
      grow: 0,
      echo: 1,
      gate: 0,
      scramble: 1,
      comicSans: 0,
    })
    expect(result).not.toBeNull()
    // Output is `<scrambled> <scrambled>`; both halves must be permutations of "ab".
    const parts = result!.content.split(" ")
    expect(parts).toHaveLength(2)
    expect(sortedChars(parts[0]!)).toBe("ab")
    expect(sortedChars(parts[1]!)).toBe("ab")
    // The base and echo segments share the same scrambled word.
    expect(parts[0]).toBe(parts[1])
  })
})
