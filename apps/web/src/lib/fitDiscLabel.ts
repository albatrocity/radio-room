import { DISC_LABEL_FONT_FAMILY } from "./discLabelFont"

/** SVG font-family for hand-lettered disc labels; matches `fonts.handwriting` in the theme. */
export const HANDWRITING_FONT_FAMILY = DISC_LABEL_FONT_FAMILY

const DISC_LABEL_RADIUS = 40
/** Fraction of the top semicircle the text may occupy. */
const DISC_LABEL_ARC_FRACTION = 0.8
const DISC_LABEL_ARC_MM = Math.PI * DISC_LABEL_RADIUS * DISC_LABEL_ARC_FRACTION
const DISC_LABEL_FONT_MAX = 9
const DISC_LABEL_FONT_MIN = 5.5
/** Mean Caveat advance width as a fraction of font size, for mixed-case text. */
const DISC_LABEL_ADVANCE = 0.42

/** Backs up to the last space in the final quarter so the ellipsis follows a whole word. */
export function truncateOnWord(text: string, maxLen: number): string {
  if (maxLen <= 0) return ""
  if (text.length <= maxLen) return text
  const slice = text.slice(0, maxLen)
  const lastSpace = slice.lastIndexOf(" ")
  if (lastSpace >= Math.floor(maxLen * 0.75)) return slice.slice(0, lastSpace)
  return slice
}

/**
 * Pick a font size and optional truncation so the label fits the crown of the
 * disc. Dimensions are in case millimetres and scale with the SVG viewBox.
 */
export function fitDiscLabel(raw: string): { text: string; fontSize: number } | undefined {
  const text = raw.trim()
  if (!text) return undefined
  const widest = DISC_LABEL_ARC_MM / (text.length * DISC_LABEL_ADVANCE)
  const fontSize = Math.min(DISC_LABEL_FONT_MAX, Math.max(DISC_LABEL_FONT_MIN, widest))
  const budget = Math.floor(DISC_LABEL_ARC_MM / (fontSize * DISC_LABEL_ADVANCE))
  if (text.length <= budget) return { text, fontSize }
  return { text: `${truncateOnWord(text, budget - 1)}\u2026`, fontSize }
}

/** Arc radius for `<textPath>` on the disc crown, in case millimetres. */
export const DISC_LABEL_PATH_RADIUS = DISC_LABEL_RADIUS
