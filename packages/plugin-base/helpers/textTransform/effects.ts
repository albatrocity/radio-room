import type { TextEffect } from "@repo/types"
import { tokenizeWords } from "../chatTransform"
import type { TextEffectStacks } from "./flags"

/**
 * Size scale ordered from smallest to largest. The base index `NORMAL_INDEX`
 * represents normal/`md` text; positive offsets grow text, negative offsets
 * shrink it. Steps use wider Chakra jumps than body copy (`xl`–`7xl` for grow)
 * so stacked buffs read as clearly exaggerated.
 */
const SIZE_SCALE = [
  "4xs",
  "3xs",
  "2xs",
  "xs",
  "normal",
  "xl",
  "3xl",
  "5xl",
  "7xl",
] as const satisfies ReadonlyArray<TextEffect["value"]>

const NORMAL_INDEX = 4
const MIN_INDEX = 0
const MAX_INDEX = SIZE_SCALE.length - 1
const MAX_SHIFT = NORMAL_INDEX // +/-4
const MAX_ECHO = 4

function clampShift(shift: number): number {
  if (shift > MAX_SHIFT) return MAX_SHIFT
  if (shift < -MAX_SHIFT) return -MAX_SHIFT
  return shift
}

function sizeForIndex(index: number): TextEffect["value"] {
  const clamped = Math.max(MIN_INDEX, Math.min(MAX_INDEX, index))
  return SIZE_SCALE[clamped]!
}

/**
 * Net size shift = `grow - shrink`, clamped to the supported range
 * (`+/-4`). Positive values produce larger text, negative values smaller.
 */
export function netSizeShift(stacks: TextEffectStacks): number {
  return clampShift(stacks.grow - stacks.shrink)
}

/**
 * Resolve the base text size for a chat word. Returns `null` when no size
 * shift is needed (so callers can omit the size effect entirely). The legacy
 * `"normal"` value is used at shift 0 only when an echo follows; otherwise
 * we return `null` to keep payloads minimal.
 */
export function resolveBaseSize(stacks: TextEffectStacks): TextEffect["value"] | null {
  const shift = netSizeShift(stacks)
  if (shift === 0) return null
  return sizeForIndex(NORMAL_INDEX + shift)
}

/**
 * Resolve the size for the Nth echo (1-indexed). Each echo is one step smaller
 * than the previous, creating a fading cascade. Sizes are clamped at `4xs`.
 */
export function resolveEchoSize(
  stacks: TextEffectStacks,
  echoIndex: number,
): TextEffect["value"] {
  const baseShift = netSizeShift(stacks)
  const echoShift = baseShift - echoIndex
  return sizeForIndex(NORMAL_INDEX + echoShift)
}

/** Number of echo repetitions per word (echo stacks, capped at 4). */
export function echoCount(stacks: TextEffectStacks): number {
  if (stacks.echo <= 0) return 0
  return Math.min(stacks.echo, MAX_ECHO)
}

/**
 * Gate transform: each ASCII lowercase letter becomes a visible underscore. We emit
 * Markdown `\_` so chat renderers (react-markdown / GFM) treat it as a literal `_`
 * instead of italics delimiters.
 */
export function applyGateTransform(text: string): string {
  return text.replace(/[a-z]/g, "\\_")
}

/**
 * Unicode-aware "is letter" check that doesn't rely on the `/u` regex flag
 * (which would require an ES2018+ target). A character is treated as a letter
 * iff it has distinct upper and lower case forms — true for ASCII letters,
 * Latin accented letters (`é`, `ñ`, etc.), Cyrillic, Greek, etc. Caseless
 * scripts (CJK, numerals, punctuation) read as non-alpha and stay anchored.
 */
function isAlpha(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase()
}

/** Fisher–Yates in-place shuffle using `Math.random`. */
function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
}

/**
 * Shuffle alphabetic entries among themselves, in place. Non-alpha entries
 * keep their index. Uses Unicode `\p{L}` so accented letters and other
 * non-ASCII letters participate, while digits / punctuation stay anchored.
 */
function shuffleAlphaWithin(chars: string[]): void {
  const alphaIdx: number[] = []
  for (let i = 0; i < chars.length; i++) {
    if (isAlpha(chars[i]!)) alphaIdx.push(i)
  }
  if (alphaIdx.length < 2) return
  const alphaChars = alphaIdx.map((i) => chars[i]!)
  shuffleInPlace(alphaChars)
  alphaIdx.forEach((origIdx, k) => {
    chars[origIdx] = alphaChars[k]!
  })
}

/**
 * Pick a random partition of `total` into `count` positive integers that sum
 * to `total`. Falls back to one-per-bucket when `total < count` (truncating
 * to `total` non-empty buckets) so we never emit empty words.
 */
function randomPartitionPositive(total: number, count: number): number[] {
  if (count <= 0 || total <= 0) return []
  if (count === 1) return [total]
  if (total < count) {
    return Array.from({ length: total }, () => 1)
  }
  // Distinct cut points in [1, total - 1], producing `count` adjacent diffs.
  const cuts = new Set<number>()
  while (cuts.size < count - 1) {
    cuts.add(1 + Math.floor(Math.random() * (total - 1)))
  }
  const sorted = Array.from(cuts).sort((a, b) => a - b)
  const parts: number[] = []
  let prev = 0
  for (const c of sorted) {
    parts.push(c - prev)
    prev = c
  }
  parts.push(total - prev)
  return parts
}

function randInt(min: number, max: number): number {
  if (max <= min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * Scramble the alphabetic letters in `content` based on stack count:
 *
 * - **1 stack**: each word's alpha letters are shuffled among themselves;
 *   non-alpha chars and word boundaries are preserved.
 * - **2 stacks**: alpha letters are pooled across the whole message, shuffled,
 *   and refilled into the same word slots (per-word lengths and non-alpha
 *   positions preserved).
 * - **3+ stacks**: same letter pool + shuffle, but word boundaries are
 *   discarded and the result is re-emitted as a random number of new words
 *   (between 1 and `2 * originalWordCount`) joined by single spaces.
 *
 * Returns `content` unchanged when `stacks <= 0` or there is no content to scramble.
 */
export function applyScrambleTransform(content: string, stacks: number): string {
  if (stacks <= 0 || content.length === 0) return content

  if (stacks === 1) {
    return content.replace(/\S+/g, (word) => {
      const chars = Array.from(word)
      shuffleAlphaWithin(chars)
      return chars.join("")
    })
  }

  const tokens = tokenizeWords(content)
  const wordTokens = tokens.filter((t) => t.word !== "")
  if (wordTokens.length === 0) return content

  const wordCharArrays = wordTokens.map((t) => Array.from(t.word))
  const linearChars: string[] = []
  for (const arr of wordCharArrays) {
    for (const ch of arr) linearChars.push(ch)
  }
  if (linearChars.length === 0) return content

  shuffleAlphaWithin(linearChars)

  if (stacks === 2) {
    let cursor = 0
    let wordIdx = 0
    let out = ""
    for (const t of tokens) {
      if (t.word === "") {
        out += t.trailing
        continue
      }
      const len = wordCharArrays[wordIdx]!.length
      out += linearChars.slice(cursor, cursor + len).join("")
      out += t.trailing
      cursor += len
      wordIdx += 1
    }
    return out
  }

  // stacks >= 3: random word count + lengths
  const total = linearChars.length
  const origWordCount = wordTokens.length
  const newCount = randInt(1, Math.max(1, origWordCount * 2))
  const lengths = randomPartitionPositive(total, newCount)
  const out: string[] = []
  let cursor = 0
  for (const len of lengths) {
    out.push(linearChars.slice(cursor, cursor + len).join(""))
    cursor += len
  }
  return out.join(" ")
}
