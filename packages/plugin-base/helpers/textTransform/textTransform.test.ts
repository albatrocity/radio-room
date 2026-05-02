import { describe, expect, it } from "vitest"
import type { GameStateModifier } from "@repo/types"
import {
  countTextEffectStacks,
  ECHO_FLAG,
  GROW_FLAG,
  SHRINK_FLAG,
  type TextEffectStacks,
} from "./flags"
import {
  echoCount,
  netSizeShift,
  resolveBaseSize,
  resolveEchoSize,
} from "./effects"
import { applyTextEffects } from "./pipeline"

const NOW = 1_000_000_000_000

function makeModifier(
  flagName: string,
  opts: { id?: string; expired?: boolean; future?: boolean } = {},
): GameStateModifier {
  return {
    id: opts.id ?? `m-${flagName}-${Math.random()}`,
    name: `${flagName}-modifier`,
    source: "test",
    effects: [{ type: "flag", name: flagName, value: true }],
    startAt: opts.future ? NOW + 60_000 : NOW - 1000,
    endAt: opts.expired ? NOW - 1 : NOW + 60_000,
    stackBehavior: "stack",
  }
}

function stacks(input: Partial<TextEffectStacks>): TextEffectStacks {
  return { shrink: 0, grow: 0, echo: 0, ...input }
}

describe("countTextEffectStacks", () => {
  it("returns zero stacks when there are no modifiers", () => {
    expect(countTextEffectStacks(undefined, NOW)).toEqual({
      shrink: 0,
      grow: 0,
      echo: 0,
    })
    expect(countTextEffectStacks([], NOW)).toEqual({
      shrink: 0,
      grow: 0,
      echo: 0,
    })
  })

  it("counts each shrink/grow/echo modifier as a single stack", () => {
    const modifiers = [
      makeModifier(SHRINK_FLAG, { id: "s1" }),
      makeModifier(SHRINK_FLAG, { id: "s2" }),
      makeModifier(GROW_FLAG, { id: "g1" }),
      makeModifier(ECHO_FLAG, { id: "e1" }),
      makeModifier(ECHO_FLAG, { id: "e2" }),
      makeModifier(ECHO_FLAG, { id: "e3" }),
    ]
    expect(countTextEffectStacks(modifiers, NOW)).toEqual({
      shrink: 2,
      grow: 1,
      echo: 3,
    })
  })

  it("ignores expired or future modifiers", () => {
    const modifiers = [
      makeModifier(SHRINK_FLAG, { id: "active" }),
      makeModifier(SHRINK_FLAG, { id: "expired", expired: true }),
      makeModifier(GROW_FLAG, { id: "future", future: true }),
    ]
    expect(countTextEffectStacks(modifiers, NOW)).toEqual({
      shrink: 1,
      grow: 0,
      echo: 0,
    })
  })

  it("ignores flag effects with falsy values", () => {
    const modifiers: GameStateModifier[] = [
      {
        id: "m1",
        name: "noop",
        source: "test",
        effects: [{ type: "flag", name: SHRINK_FLAG, value: false }],
        startAt: NOW - 1000,
        endAt: NOW + 60_000,
        stackBehavior: "stack",
      },
    ]
    expect(countTextEffectStacks(modifiers, NOW).shrink).toBe(0)
  })

  it("counts a single modifier carrying multiple text-effect flags as one stack each", () => {
    const modifiers: GameStateModifier[] = [
      {
        id: "combo",
        name: "combo",
        source: "test",
        effects: [
          { type: "flag", name: SHRINK_FLAG, value: true },
          { type: "flag", name: ECHO_FLAG, value: true },
        ],
        startAt: NOW - 1000,
        endAt: NOW + 60_000,
        stackBehavior: "stack",
      },
    ]
    expect(countTextEffectStacks(modifiers, NOW)).toEqual({
      shrink: 1,
      grow: 0,
      echo: 1,
    })
  })
})

describe("netSizeShift", () => {
  it("returns 0 when grow and shrink cancel", () => {
    expect(netSizeShift(stacks({ grow: 1, shrink: 1 }))).toBe(0)
    expect(netSizeShift(stacks({ grow: 3, shrink: 3 }))).toBe(0)
  })

  it("returns positive shift for grow majority", () => {
    expect(netSizeShift(stacks({ grow: 2, shrink: 1 }))).toBe(1)
    expect(netSizeShift(stacks({ grow: 3, shrink: 1 }))).toBe(2)
    expect(netSizeShift(stacks({ grow: 4 }))).toBe(4)
  })

  it("returns negative shift for shrink majority", () => {
    expect(netSizeShift(stacks({ shrink: 2, grow: 1 }))).toBe(-1)
    expect(netSizeShift(stacks({ shrink: 3 }))).toBe(-3)
  })

  it("clamps at +/-4", () => {
    expect(netSizeShift(stacks({ grow: 10 }))).toBe(4)
    expect(netSizeShift(stacks({ shrink: 10 }))).toBe(-4)
    expect(netSizeShift(stacks({ grow: 6, shrink: 1 }))).toBe(4)
  })
})

describe("resolveBaseSize", () => {
  it("returns null when no net size shift", () => {
    expect(resolveBaseSize(stacks({}))).toBeNull()
    expect(resolveBaseSize(stacks({ echo: 3 }))).toBeNull()
    expect(resolveBaseSize(stacks({ grow: 2, shrink: 2 }))).toBeNull()
  })

  it("maps shrink stacks to progressively smaller sizes", () => {
    expect(resolveBaseSize(stacks({ shrink: 1 }))).toBe("sm")
    expect(resolveBaseSize(stacks({ shrink: 2 }))).toBe("xs")
    expect(resolveBaseSize(stacks({ shrink: 3 }))).toBe("2xs")
    expect(resolveBaseSize(stacks({ shrink: 4 }))).toBe("3xs")
  })

  it("maps grow stacks to progressively larger sizes", () => {
    expect(resolveBaseSize(stacks({ grow: 1 }))).toBe("lg")
    expect(resolveBaseSize(stacks({ grow: 2 }))).toBe("xl")
    expect(resolveBaseSize(stacks({ grow: 3 }))).toBe("2xl")
    expect(resolveBaseSize(stacks({ grow: 4 }))).toBe("3xl")
  })

  it("respects cancellation between grow and shrink", () => {
    expect(resolveBaseSize(stacks({ grow: 2, shrink: 1 }))).toBe("lg")
    expect(resolveBaseSize(stacks({ grow: 1, shrink: 2 }))).toBe("sm")
    expect(resolveBaseSize(stacks({ grow: 3, shrink: 1 }))).toBe("xl")
  })

  it("clamps oversized shifts", () => {
    expect(resolveBaseSize(stacks({ grow: 99 }))).toBe("3xl")
    expect(resolveBaseSize(stacks({ shrink: 99 }))).toBe("3xs")
  })
})

describe("resolveEchoSize", () => {
  it("starts one step smaller than the base size", () => {
    expect(resolveEchoSize(stacks({}), 1)).toBe("sm")
    expect(resolveEchoSize(stacks({ grow: 2 }), 1)).toBe("lg")
    expect(resolveEchoSize(stacks({ shrink: 2 }), 1)).toBe("2xs")
  })

  it("cascades each successive echo one step smaller", () => {
    expect(resolveEchoSize(stacks({}), 1)).toBe("sm")
    expect(resolveEchoSize(stacks({}), 2)).toBe("xs")
    expect(resolveEchoSize(stacks({}), 3)).toBe("2xs")
    expect(resolveEchoSize(stacks({}), 4)).toBe("3xs")
  })

  it("cascades from a grown base toward smaller sizes", () => {
    const s = stacks({ grow: 4 })
    expect(resolveEchoSize(s, 1)).toBe("2xl")
    expect(resolveEchoSize(s, 2)).toBe("xl")
    expect(resolveEchoSize(s, 3)).toBe("lg")
    expect(resolveEchoSize(s, 4)).toBe("normal")
  })

  it("clamps echo size at the smallest available size", () => {
    const s = stacks({ shrink: 2 })
    expect(resolveEchoSize(s, 1)).toBe("2xs")
    expect(resolveEchoSize(s, 2)).toBe("3xs")
    expect(resolveEchoSize(s, 3)).toBe("3xs")
    expect(resolveEchoSize(s, 4)).toBe("3xs")
  })
})

describe("echoCount", () => {
  it("returns zero when no echo stacks", () => {
    expect(echoCount(stacks({}))).toBe(0)
  })

  it("returns 1-4 echoes for 1-4 stacks", () => {
    expect(echoCount(stacks({ echo: 1 }))).toBe(1)
    expect(echoCount(stacks({ echo: 2 }))).toBe(2)
    expect(echoCount(stacks({ echo: 3 }))).toBe(3)
    expect(echoCount(stacks({ echo: 4 }))).toBe(4)
  })

  it("clamps at 4 echoes", () => {
    expect(echoCount(stacks({ echo: 99 }))).toBe(4)
  })
})

describe("applyTextEffects", () => {
  it("returns null when no effects are active", () => {
    expect(applyTextEffects("Hello world", stacks({}))).toBeNull()
  })

  it("returns null when grow and shrink cancel and there is no echo", () => {
    expect(applyTextEffects("Hello", stacks({ grow: 1, shrink: 1 }))).toBeNull()
  })

  it("applies a single shrink to each word without echo", () => {
    const result = applyTextEffects("Hello world", stacks({ shrink: 1 }))
    expect(result).not.toBeNull()
    expect(result!.content).toBe("Hello world")
    expect(result!.contentSegments).toEqual([
      { text: "Hello", effects: [{ type: "size", value: "sm" }] },
      { text: " " },
      { text: "world", effects: [{ type: "size", value: "sm" }] },
    ])
  })

  it("emits cascading echoes from a normal base", () => {
    const result = applyTextEffects("Hello", stacks({ echo: 3 }))
    expect(result).not.toBeNull()
    expect(result!.content).toBe("Hello Hello Hello Hello")
    expect(result!.contentSegments).toEqual([
      { text: "Hello" },
      { text: " Hello", effects: [{ type: "size", value: "sm" }] },
      { text: " Hello", effects: [{ type: "size", value: "xs" }] },
      { text: " Hello", effects: [{ type: "size", value: "2xs" }] },
    ])
  })

  it("combines grow and echo with cascading echo sizes", () => {
    const result = applyTextEffects("Hi", stacks({ grow: 2, echo: 2 }))
    expect(result).not.toBeNull()
    expect(result!.content).toBe("Hi Hi Hi")
    expect(result!.contentSegments).toEqual([
      { text: "Hi", effects: [{ type: "size", value: "xl" }] },
      { text: " Hi", effects: [{ type: "size", value: "lg" }] },
      { text: " Hi", effects: [{ type: "size", value: "normal" }] },
    ])
  })

  it("preserves whitespace between words", () => {
    const result = applyTextEffects("a   b", stacks({ shrink: 1 }))
    expect(result!.content).toBe("a   b")
  })

  it("handles empty string by returning null when no echo", () => {
    expect(applyTextEffects("", stacks({}))).toBeNull()
  })

  it("clamps echo sizes at the smallest available size", () => {
    const result = applyTextEffects("hi", stacks({ shrink: 2, echo: 4 }))
    expect(result).not.toBeNull()
    const sizes = result!.contentSegments
      .filter((s) => s.text.trim() === "hi")
      .map((s) => s.effects?.[0]?.type === "size" ? s.effects[0].value : null)
    expect(sizes).toEqual(["xs", "2xs", "3xs", "3xs", "3xs"])
  })
})
