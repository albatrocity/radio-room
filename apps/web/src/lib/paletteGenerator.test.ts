import { describe, it, expect } from "vitest"
import { generateDynamicPalette, SURFACE_MIN_CONTRAST } from "./paletteGenerator"
import type { RGB } from "./colorExtractor"

function parseHex(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

function getLuminance([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(color1)
  const l2 = getLuminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const WHITE: RGB = [255, 255, 255]

describe("generateDynamicPalette surface contrast", () => {
  // Vibrant artwork-like colors where shade 100/900 often collapse into surfaces
  const artworkColors: RGB[] = [
    [220, 40, 80],
    [40, 60, 120],
    [30, 140, 160],
  ]

  it("keeps action and secondary subtle shades distinct from white and primary.900", () => {
    const palette = generateDynamicPalette(artworkColors)
    const darkSurface = parseHex(palette.primary[900])

    expect(getContrastRatio(parseHex(palette.action[100]), WHITE)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
    expect(getContrastRatio(parseHex(palette.action[900]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )

    expect(getContrastRatio(parseHex(palette.secondary[100]), WHITE)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
    expect(getContrastRatio(parseHex(palette.secondary[900]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
  })

  it("keeps primary shade 100 distinct from white without changing primary.900 as dark surface", () => {
    const palette = generateDynamicPalette(artworkColors)

    expect(getContrastRatio(parseHex(palette.primary[100]), WHITE)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
  })

  it("handles identical fallback colors without collapsing subtle surfaces", () => {
    const palette = generateDynamicPalette([[128, 128, 128]])
    const darkSurface = parseHex(palette.primary[900])

    expect(getContrastRatio(parseHex(palette.action[100]), WHITE)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
    expect(getContrastRatio(parseHex(palette.action[900]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
  })
})
