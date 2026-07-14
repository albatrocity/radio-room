/**
 * Palette Generator
 *
 * Generates full 50-900 shade palettes from base RGB colors.
 * Ensures proper contrast ratios for accessibility.
 */

import type { RGB } from "./colorExtractor"
import type { ColorHues } from "../types/AppTheme"

// Shade levels used in the theme
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

// WCAG AA minimum contrast ratio for normal text
const MIN_CONTRAST_RATIO = 4.5

/**
 * Minimum contrast for dark surface shades (800/900) vs primary.900.
 * Light chrome (50/100) uses a milder target and leans on saturation instead,
 * so Dynamic panels don't go muddy/dark.
 */
export const SURFACE_MIN_CONTRAST = 1.4

/** Milder separation for light chrome tints on white — chroma does the heavy lifting. */
const LIGHT_SURFACE_MIN_CONTRAST = 1.2

/** Keep light surface shades visibly tinted (HSL saturation %). */
const MIN_LIGHT_SURFACE_SATURATION = 55
/** Shade 50 (colorPalette.contrast) gets a bit more chroma for chrome panels. */
const MIN_CONTRAST_SURFACE_SATURATION = 62

/** Cap lightness so light chrome stays a pastel tint, not muddy mid-gray. */
const MAX_LIGHT_SURFACE_LIGHTNESS = 90
/** Shade 50 stays higher-key than subtle (100). */
const MAX_CONTRAST_SURFACE_LIGHTNESS = 94

const WHITE: RGB = [255, 255, 255]

/**
 * Parse a hex color string to RGB.
 */
function parseHex(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

/**
 * Convert RGB to HSL color space.
 */
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
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

/**
 * Convert HSL to RGB color space.
 */
function hslToRgb([h, s, l]: [number, number, number]): RGB {
  h /= 360
  s /= 100
  l /= 100

  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * Convert RGB to hex color string.
 */
function rgbToHex([r, g, b]: RGB): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16)
        return hex.length === 1 ? "0" + hex : hex
      })
      .join("")
  )
}

/**
 * Calculate relative luminance of an RGB color.
 * Used for contrast ratio calculations.
 */
function getLuminance([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Calculate contrast ratio between two colors.
 * Returns a value between 1 and 21.
 */
function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(color1)
  const l2 = getLuminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Target lightness values for each shade level.
 * These create a visually balanced palette from light to dark.
 */
const LIGHTNESS_MAP: Record<number, number> = {
  50: 95,
  100: 88,
  200: 80,
  300: 70,
  400: 60,
  500: 50,
  600: 40,
  700: 30,
  800: 20,
  900: 10,
}

/**
 * Saturation adjustments for each shade level.
 * Light chrome shades stay more chromatic so Dynamic panels read like static themes
 * (e.g. Grape secondary.50) rather than washed-out gray.
 */
const SATURATION_ADJUSTMENTS: Record<number, number> = {
  50: 0.65,
  100: 0.65,
  200: 0.75,
  300: 0.85,
  400: 0.95,
  500: 1.0,
  600: 1.0,
  700: 0.95,
  800: 0.9,
  900: 0.85,
}

/**
 * Generate a color shade at a specific lightness level.
 */
function generateShade(baseColor: RGB, targetLightness: number, saturationMult: number): RGB {
  const [h, s] = rgbToHsl(baseColor)
  const adjustedSaturation = Math.min(100, s * saturationMult)
  return hslToRgb([h, adjustedSaturation, targetLightness])
}

/**
 * Generate a full shade palette (50-900) from a base RGB color.
 */
export function generateShades(baseColor: RGB): ColorHues {
  const shades: Partial<ColorHues> = {}

  for (const shade of SHADES) {
    const lightness = LIGHTNESS_MAP[shade]
    const satMult = SATURATION_ADJUSTMENTS[shade]
    const color = generateShade(baseColor, lightness, satMult)
    shades[shade] = rgbToHex(color)
  }

  return shades as ColorHues
}

/**
 * Adjust a color to ensure it has sufficient contrast with a reference color.
 * Lightens or darkens the color until contrast requirements are met.
 */
function ensureContrast(color: RGB, reference: RGB, minRatio: number = MIN_CONTRAST_RATIO): RGB {
  let [h, s, l] = rgbToHsl(color)
  const refLuminance = getLuminance(reference)

  // Determine if we should lighten or darken
  const shouldLighten = refLuminance < 0.5

  let attempts = 0
  const maxAttempts = 50

  while (getContrastRatio(hslToRgb([h, s, l]), reference) < minRatio && attempts < maxAttempts) {
    if (shouldLighten) {
      l = Math.min(100, l + 5)
    } else {
      l = Math.max(0, l - 5)
    }
    attempts++
  }

  return hslToRgb([h, s, l])
}

/**
 * Validate and adjust a palette so solid fills stay readable against contrast text,
 * without destroying light chrome shades (50/100) used as panel backgrounds.
 *
 * Chakra maps colorPalette.contrast → shade 50 in light mode (text on solid) AND
 * we use shade 50 as light chrome (secondaryBg / colorPalette.contrast surfaces).
 * So when 500 is too light for light-on-dark text, darken 500 — never shade 50/100.
 */
export function validatePaletteContrast(palette: ColorHues): ColorHues {
  const solid = parseHex(palette[500])
  const contrast = parseHex(palette[50])

  if (getContrastRatio(contrast, solid) < MIN_CONTRAST_RATIO) {
    // Darken solid against the light contrast shade (ref is light → ensureContrast darkens)
    palette[500] = rgbToHex(ensureContrast(solid, contrast))
  }

  // Dark mode: contrast text (200) on solid (800)
  const darkSolid = parseHex(palette[800])
  const darkContrast = parseHex(palette[200])
  if (getContrastRatio(darkContrast, darkSolid) < MIN_CONTRAST_RATIO) {
    palette[800] = rgbToHex(ensureContrast(darkSolid, darkContrast))
  }

  return palette
}

/**
 * Ensure surface / chrome shades are distinguishable from the app surfaces they
 * sit on:
 * - Light: shade 50 (contrast) and 100 (subtle) vs white — prefer chroma over darkening
 * - Dark: shade 800 (muted) and 900 (subtle) vs darkSurface (primary.900 / appBg)
 *
 * When skipDark is true, only light shades are adjusted (used for primary, which
 * *is* the dark reference surface).
 */
export function ensureSurfaceContrast(
  palette: ColorHues,
  darkSurface: RGB,
  options: { skipDark?: boolean } = {},
): ColorHues {
  palette[50] = rgbToHex(
    polishLightSurface(parseHex(palette[50]), {
      maxLightness: MAX_CONTRAST_SURFACE_LIGHTNESS,
      minSaturation: MIN_CONTRAST_SURFACE_SATURATION,
    }),
  )
  palette[100] = rgbToHex(
    polishLightSurface(parseHex(palette[100]), {
      maxLightness: MAX_LIGHT_SURFACE_LIGHTNESS,
      minSaturation: MIN_LIGHT_SURFACE_SATURATION,
    }),
  )

  if (!options.skipDark) {
    for (const shade of [800, 900] as const) {
      const color = parseHex(palette[shade])
      if (getContrastRatio(color, darkSurface) < SURFACE_MIN_CONTRAST) {
        palette[shade] = rgbToHex(ensureContrast(color, darkSurface, SURFACE_MIN_CONTRAST))
      }
    }
  }

  return palette
}

/**
 * Light chrome visibility: force a high-key pastel. Do not darken for white
 * contrast — that crushed Dynamic secondary.50 into olive panels that shared
 * ChatInput's secondaryBg and killed placeholder contrast.
 */
function polishLightSurface(
  color: RGB,
  opts: { maxLightness: number; minSaturation: number },
): RGB {
  const [h, s] = rgbToHsl(color)
  return hslToRgb([h, Math.max(s, opts.minSaturation), opts.maxLightness])
}

export interface DynamicPalette {
  primary: ColorHues
  secondary: ColorHues
  action: ColorHues
}

/**
 * Generate a complete dynamic theme palette from extracted colors.
 *
 * @param colors - Array of RGB colors extracted from artwork (should have at least 3)
 * @returns Complete palette for primary, secondary, and action color categories
 */
export function generateDynamicPalette(colors: RGB[]): DynamicPalette {
  // Ensure we have at least 3 colors
  const [primaryBase, secondaryBase, actionBase] = getColorRoles(colors)

  // Generate shade palettes for each role
  const primary = validatePaletteContrast(generateShades(primaryBase))
  const secondary = validatePaletteContrast(generateShades(secondaryBase))
  const action = validatePaletteContrast(generateShades(actionBase))

  // Capture the dark app surface (primary.900 / appBg) before mutating shades
  const darkSurface = parseHex(primary[900])

  // Surface/chrome shades (50/100 vs white, 800/900 vs primary.900) must read
  // as visible tints. Primary only gets the light checks — it IS the dark ref.
  ensureSurfaceContrast(primary, darkSurface, { skipDark: true })
  ensureSurfaceContrast(secondary, darkSurface)
  ensureSurfaceContrast(action, darkSurface)

  return { primary, secondary, action }
}

/**
 * Assign colors to primary, secondary, and action roles.
 * - Action: Most vibrant color (interactive elements)
 * - Primary: Next most vibrant (dominant / app surfaces)
 * - Secondary: Chromatic chrome color — preferred candidate from artwork if
 *   saturated enough, otherwise a hue-shifted derivation of primary. Never the
 *   "least vibrant" swatch (that collapses Dynamic UI chrome to gray).
 */
function getColorRoles(colors: RGB[]): [RGB, RGB, RGB] {
  if (colors.length === 0) {
    const neutral: RGB = [128, 128, 128]
    return [neutral, neutral, neutral]
  }

  if (colors.length === 1) {
    const primary = colors[0]
    return [primary, deriveSecondary(primary), primary]
  }

  // Score colors for vibrancy and use that to determine roles
  const scored = colors.map((color) => ({
    color,
    vibrancy: getVibrancy(color),
  }))

  // Sort by vibrancy descending
  scored.sort((a, b) => b.vibrancy - a.vibrancy)

  const action = scored[0].color
  const primary = scored.length > 1 ? scored[1].color : scored[0].color
  const candidate = scored.length > 2 ? scored[2].color : undefined
  const secondary = deriveSecondary(primary, candidate)

  return [primary, secondary, action]
}

/** Minimum HSL saturation so secondary chrome stays chromatic like static themes. */
const MIN_SECONDARY_SATURATION = 35

/**
 * Build a secondary base color that stays visibly tinted.
 * Uses an artwork candidate when it clears the saturation floor; otherwise
 * hue-shifts primary (~30°) with a moderated but floored saturation.
 */
function deriveSecondary(primary: RGB, candidate?: RGB): RGB {
  if (candidate) {
    const [, candidateSat] = rgbToHsl(candidate)
    if (candidateSat >= MIN_SECONDARY_SATURATION) {
      return ensureMinSaturation(desaturateColor(candidate, 0.85), MIN_SECONDARY_SATURATION)
    }
  }

  return shiftHue(primary, 30, 0.75, MIN_SECONDARY_SATURATION)
}

/**
 * Rotate hue and apply a saturation multiplier with a floor.
 */
function shiftHue(color: RGB, degrees: number, satMult: number, minSat: number): RGB {
  const [h, s, l] = rgbToHsl(color)
  const newH = (h + degrees + 360) % 360
  const newS = Math.max(minSat, Math.min(100, s * satMult))
  return hslToRgb([newH, newS, l])
}

/**
 * Raise saturation to at least minSat without changing hue or lightness.
 */
function ensureMinSaturation(color: RGB, minSat: number): RGB {
  const [h, s, l] = rgbToHsl(color)
  if (s >= minSat) return color
  return hslToRgb([h, minSat, l])
}

/**
 * Calculate the vibrancy (saturation weighted by lightness) of a color.
 */
function getVibrancy([r, g, b]: RGB): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)

  if (max === 0) return 0

  const saturation = (max - min) / max
  const lightness = (max + min) / 2 / 255
  const lightnessWeight = 1 - Math.abs(lightness - 0.5) * 2

  return saturation * lightnessWeight
}

/**
 * Desaturate a color by a given factor.
 */
function desaturateColor(color: RGB, factor: number): RGB {
  const [h, s, l] = rgbToHsl(color)
  return hslToRgb([h, s * factor, l])
}
