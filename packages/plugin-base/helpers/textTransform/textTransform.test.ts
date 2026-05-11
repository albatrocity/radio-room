import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { GameStateModifier } from "@repo/types"
import { countFlagStacks } from "@repo/game-logic"
import type { TextEffectKind } from "./types"
import { applyScrambleTransform } from "./effects"
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

/** Gate-style lowercase → visible underscores for Markdown (matches item gate pedal). */
function applyGateWordLowercase(text: string): string {
  return text.replace(/[a-z]/g, "\\_")
}

describe("applyGateWordLowercase (gate word phase helper)", () => {
  test("replaces ASCII lowercase with Markdown-escaped underscores", () => {
    expect(applyGateWordLowercase("hello")).toBe("\\_\\_\\_\\_\\_")
    expect(applyGateWordLowercase("Hello")).toBe("H\\_\\_\\_\\_")
    expect(applyGateWordLowercase("aBc123")).toBe("\\_B\\_123")
  })

  test("leaves punctuation and non-ASCII alone", () => {
    expect(applyGateWordLowercase("café")).toBe("\\_\\_\\_é")
    expect(applyGateWordLowercase("!!!")).toBe("!!!")
  })
})

describe("countFlagStacks", () => {
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
        effects: [{ type: "flag", name: "gate", value: true }],
      },
      {
        id: "m2",
        name: "g2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: "gate", value: true }],
      },
    ]
    expect(countFlagStacks(modifiers, now)).toEqual({ gate: 2 })
  })

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
          { type: "flag", name: "scramble", value: true },
          { type: "flag", name: "scramble", value: true },
        ],
      },
      {
        id: "s2",
        name: "scramble2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: "scramble", value: true }],
      },
      {
        id: "expired",
        name: "scrambleX",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 500,
        effects: [{ type: "flag", name: "scramble", value: true }],
      },
    ]
    expect(countFlagStacks(modifiers, now)).toEqual({ scramble: 2 })
  })

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
        effects: [{ type: "flag", name: "comic_sans", value: true }],
      },
    ]
    expect(countFlagStacks(modifiers, now)).toEqual({ comic_sans: 1 })
  })
})

const gateKind: TextEffectKind = {
  phase: "word",
  activeWhen: "gate",
  transform: (word) => applyGateWordLowercase(word),
}

describe("applyTextEffects gate", () => {
  test("gate-only returns masked content", () => {
    const result = applyTextEffects("Hello world", { gate: 1 }, [gateKind])
    expect(result).not.toBeNull()
    expect(result!.content).toBe("H\\_\\_\\_\\_ \\_\\_\\_\\_\\_")
    expect(result!.contentSegments.map((s) => s.text).join("")).toBe(
      "H\\_\\_\\_\\_ \\_\\_\\_\\_\\_",
    )
  })

  test("gate combines with echo on masked words", () => {
    const echoKind: TextEffectKind = {
      phase: "multiply",
      activeWhen: "echo",
      buildExtras: (_base, _stacks, _ctx, word) => [
        { text: ` ${word}`, effects: [{ type: "size", value: "3xs" }] },
      ],
    }
    const result = applyTextEffects("Hi", { gate: 1, echo: 1 }, [gateKind, echoKind])
    expect(result!.content).toBe("H\\_ H\\_")
  })
})

describe("applyTextEffects comicSans", () => {
  test("comicSans-only adds font effect to word segments", () => {
    const comicKind: TextEffectKind = {
      phase: "decorate",
      activeWhen: "comic_sans",
      effects: () => [{ type: "font", value: "comicSans" }],
    }
    const result = applyTextEffects("hello", { comic_sans: 1 }, [comicKind])
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

  const scrambleKind: TextEffectKind = {
    phase: "content",
    activeWhen: "scramble",
    transform: (content, stacks) => applyScrambleTransform(content, stacks.scramble ?? 0),
  }

  test("scramble-only returns segments equal to scrambled content", () => {
    const result = applyTextEffects("hello world", { scramble: 1 }, [scrambleKind])
    expect(result).not.toBeNull()
    expect(result!.contentSegments.map((s) => s.text).join("")).toBe(result!.content)
    expect(result!.content.length).toBe("hello world".length)
    const out = result!.content.split(" ")
    expect(out).toHaveLength(2)
  })

  test("scramble runs before gate (lowercase letters in the scrambled output are masked)", () => {
    const result = applyTextEffects("hi", { scramble: 1, gate: 1 }, [scrambleKind, gateKind])
    expect(result).not.toBeNull()
    expect(result!.content).toBe("\\_\\_")
  })

  test("scramble combines with echo: each scrambled word is echoed", () => {
    const echoKind: TextEffectKind = {
      phase: "multiply",
      activeWhen: "echo",
      buildExtras: (_base, _stacks, _ctx, word) => [
        { text: ` ${word}`, effects: [{ type: "size", value: "3xs" }] },
      ],
    }
    const result = applyTextEffects("ab", { scramble: 1, echo: 1 }, [scrambleKind, echoKind])
    expect(result).not.toBeNull()
    const parts = result!.content.split(" ")
    expect(parts).toHaveLength(2)
    expect(sortedChars(parts[0]!)).toBe("ab")
    expect(sortedChars(parts[1]!)).toBe("ab")
    expect(parts[0]).toBe(parts[1])
  })
})

describe("WordContext decorate targeting", () => {
  test("decorate can single out one word via WordContext", () => {
    const highlightLongest: TextEffectKind = {
      phase: "decorate",
      activeWhen: "pick_word",
      effects: (_stacks, ctx) => {
        let longestIdx = 0
        for (let i = 1; i < ctx.allWords.length; i++) {
          if (ctx.allWords[i]!.length > ctx.allWords[longestIdx]!.length) longestIdx = i
        }
        if (ctx.wordIndex !== longestIdx) return []
        return [{ type: "color", palette: "yellow", token: "emphasized" }]
      },
    }
    const result = applyTextEffects("aa bbbb cc", { pick_word: 1 }, [highlightLongest])
    expect(result).not.toBeNull()
    const yellowSegs = result!.contentSegments.filter((s) =>
      s.effects?.some((e) => e.type === "color" && e.palette === "yellow"),
    )
    expect(yellowSegs.length).toBeGreaterThan(0)
    expect(yellowSegs.every((s) => s.text === "bbbb")).toBe(true)
  })
})

describe("Segment phase first-wins", () => {
  test("first registered segment kind wins when both return non-null", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const a: TextEffectKind = {
      phase: "segment",
      activeWhen: "seg_a",
      order: 0,
      build: () => [{ text: "A" }],
    }
    const b: TextEffectKind = {
      phase: "segment",
      activeWhen: "seg_b",
      order: 1,
      build: () => [{ text: "B" }],
    }
    const result = applyTextEffects("word", { seg_a: 1, seg_b: 1 }, [a, b])
    expect(result!.content).toBe("A")
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
