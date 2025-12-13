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
  100: 90,
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
 * Light shades are desaturated, dark shades are slightly more saturated.
 */
const SATURATION_ADJUSTMENTS: Record<number, number> = {
  50: 0.3,
  100: 0.5,
  200: 0.7,
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
 * Validate and adjust a palette to ensure proper contrast between key pairs:
 * - contrast (50/200) should have good contrast with solid (500/800)
 */
export function validatePaletteContrast(palette: ColorHues): ColorHues {
  // Parse hex colors back to RGB for contrast calculations
  const parseHex = (hex: string): RGB => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return [0, 0, 0]
    return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
  }

  const solid = parseHex(palette[500])
  const contrast = parseHex(palette[50])

  // Check if contrast shade has sufficient contrast with solid
  const contrastRatio = getContrastRatio(contrast, solid)

  if (contrastRatio < MIN_CONTRAST_RATIO) {
    // Adjust the contrast color (50 shade) to ensure legibility
    const adjustedContrast = ensureContrast(contrast, solid)
    palette[50] = rgbToHex(adjustedContrast)

    // Also adjust 100 shade if needed
    const shade100 = parseHex(palette[100])
    const adjustedShade100 = ensureContrast(shade100, solid)
    palette[100] = rgbToHex(adjustedShade100)
  }

  // Also ensure dark mode contrast (200 vs 800)
  const darkSolid = parseHex(palette[800])
  const darkContrast = parseHex(palette[200])
  const darkContrastRatio = getContrastRatio(darkContrast, darkSolid)

  if (darkContrastRatio < MIN_CONTRAST_RATIO) {
    const adjustedDarkContrast = ensureContrast(darkContrast, darkSolid)
    palette[200] = rgbToHex(adjustedDarkContrast)
  }

  return palette
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

  return { primary, secondary, action }
}

/**
 * Assign colors to primary, secondary, and action roles.
 * - Primary: Most prominent/dominant color (used for backgrounds)
 * - Secondary: Neutral or muted color (used for UI elements)
 * - Action: Most vibrant color (used for interactive elements)
 */
function getColorRoles(colors: RGB[]): [RGB, RGB, RGB] {
  if (colors.length === 0) {
    // Fallback to neutral gray
    const neutral: RGB = [128, 128, 128]
    return [neutral, neutral, neutral]
  }

  if (colors.length === 1) {
    return [colors[0], colors[0], colors[0]]
  }

  if (colors.length === 2) {
    return [colors[0], colors[1], colors[0]]
  }

  // Score colors for vibrancy and use that to determine roles
  const scored = colors.map((color) => ({
    color,
    vibrancy: getVibrancy(color),
    lightness: rgbToHsl(color)[2],
  }))

  // Sort by vibrancy descending
  scored.sort((a, b) => b.vibrancy - a.vibrancy)

  // Most vibrant for action, medium for primary, least for secondary
  const action = scored[0].color
  const primary = scored.length > 1 ? scored[1].color : scored[0].color
  const secondary = scored.length > 2 ? scored[2].color : desaturateColor(primary, 0.5)

  return [primary, secondary, action]
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
