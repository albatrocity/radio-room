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

    expect(getContrastRatio(parseHex(palette.action[100]), WHITE)).toBeGreaterThan(1.1)
    expect(getContrastRatio(parseHex(palette.action[900]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )

    expect(getContrastRatio(parseHex(palette.secondary[100]), WHITE)).toBeGreaterThan(1.1)
    expect(getContrastRatio(parseHex(palette.secondary[900]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
  })

  it("keeps secondary contrast/muted shades distinct for sidebar chrome", () => {
    const palette = generateDynamicPalette(artworkColors)
    const darkSurface = parseHex(palette.primary[900])

    // light: colorPalette.contrast → 50; dark: colorPalette.muted → 800
    expect(getContrastRatio(parseHex(palette.secondary[50]), WHITE)).toBeGreaterThan(1.1)
    expect(getContrastRatio(parseHex(palette.secondary[800]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )

    const secondary50 = parseHex(palette.secondary[50])
    const [, sat50, light50] = rgbToHslForTest(secondary50)
    // Pastel chrome: stay light and chromatically present (HSL round-trip can nudge sat)
    expect(light50).toBeGreaterThanOrEqual(88)
    expect(sat50).toBeGreaterThanOrEqual(35)
    const chroma = Math.max(...secondary50) - Math.min(...secondary50)
    expect(chroma).toBeGreaterThanOrEqual(16)
  })

  it("keeps primary shade 100 distinct from white without changing primary.900 as dark surface", () => {
    const palette = generateDynamicPalette(artworkColors)

    expect(getContrastRatio(parseHex(palette.primary[100]), WHITE)).toBeGreaterThan(1.1)
  })

  it("handles identical fallback colors without collapsing subtle surfaces", () => {
    const palette = generateDynamicPalette([[128, 128, 128]])
    const darkSurface = parseHex(palette.primary[900])

    expect(getContrastRatio(parseHex(palette.action[100]), WHITE)).toBeGreaterThan(1.1)
    expect(getContrastRatio(parseHex(palette.action[900]), darkSurface)).toBeGreaterThanOrEqual(
      SURFACE_MIN_CONTRAST,
    )
  })

  it("keeps secondary chromatic instead of assigning the least-vibrant gray", () => {
    // Vibrant red + blue + near-gray (old logic would pick gray for secondary)
    const palette = generateDynamicPalette([
      [220, 40, 80],
      [40, 80, 200],
      [140, 140, 145],
    ])

    const secondary500 = parseHex(palette.secondary[500])
    const [, saturation] = rgbToHslForTest(secondary500)
    expect(saturation).toBeGreaterThanOrEqual(35)
  })

  it("keeps shade 50 a light pastel even when generated 500 is bright", () => {
    // Olive / chartreuse base produces a light 500 that used to force-darken 50
    const palette = generateDynamicPalette([
      [191, 195, 60],
      [217, 133, 38],
      [217, 153, 38],
    ])
    const [, , light50] = rgbToHslForTest(parseHex(palette.secondary[50]))
    expect(light50).toBeGreaterThanOrEqual(88)

    // Solid should still be readable against that light contrast shade
    expect(
      getContrastRatio(parseHex(palette.secondary[50]), parseHex(palette.secondary[500])),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it("derives a hue-shifted secondary when artwork only has one color", () => {
    const palette = generateDynamicPalette([[200, 50, 80]])
    expect(palette.secondary[500]).not.toBe(palette.primary[500])

    const [, saturation] = rgbToHslForTest(parseHex(palette.secondary[500]))
    expect(saturation).toBeGreaterThanOrEqual(35)
  })
})

function rgbToHslForTest([r, g, b]: RGB): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }
  return [h * 360, s * 100, l * 100]
}