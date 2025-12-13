/**
 * Color Extractor
 *
 * Extracts dominant colors from album artwork images using ColorThief.
 * Returns RGB color arrays that can be used for dynamic theme generation.
 */

import ColorThief from "colorthief"

export type RGB = [number, number, number]

export interface ExtractedColors {
  dominant: RGB
  palette: RGB[]
}

const colorThief = new ColorThief()

/**
 * Load an image from a URL with CORS support.
 * Returns a promise that resolves with the loaded image element.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))

    // Some CDNs require a cache-busting parameter for CORS
    // Add timestamp to bypass potential caching issues
    const separator = url.includes("?") ? "&" : "?"
    img.src = `${url}${separator}t=${Date.now()}`
  })
}

/**
 * Extract dominant colors from an image URL.
 *
 * @param imageUrl - URL of the image to extract colors from
 * @param paletteSize - Number of colors to extract for the palette (default: 5)
 * @returns Promise resolving to extracted colors or null if extraction fails
 */
export async function extractColors(
  imageUrl: string,
  paletteSize: number = 5,
): Promise<ExtractedColors | null> {
  try {
    const img = await loadImage(imageUrl)

    // Get the dominant color
    const dominant = colorThief.getColor(img) as RGB

    // Get a palette of colors
    const palette = colorThief.getPalette(img, paletteSize) as RGB[]

    return { dominant, palette }
  } catch (error) {
    console.warn("Failed to extract colors from image:", error)
    return null
  }
}

/**
 * Get the most vibrant color from a palette.
 * Vibrancy is calculated based on saturation (color intensity).
 */
export function getMostVibrant(colors: RGB[]): RGB {
  let mostVibrant = colors[0]
  let maxVibrancy = 0

  for (const color of colors) {
    const vibrancy = getVibrancy(color)
    if (vibrancy > maxVibrancy) {
      maxVibrancy = vibrancy
      mostVibrant = color
    }
  }

  return mostVibrant
}

/**
 * Calculate the vibrancy (saturation) of an RGB color.
 * Higher values indicate more vibrant/saturated colors.
 */
function getVibrancy([r, g, b]: RGB): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)

  if (max === 0) return 0

  // Saturation calculation
  const saturation = (max - min) / max

  // Weight by lightness to prefer colors that aren't too dark or too light
  const lightness = (max + min) / 2 / 255
  const lightnessWeight = 1 - Math.abs(lightness - 0.5) * 2

  return saturation * lightnessWeight
}

/**
 * Get colors sorted by distinctiveness (how different they are from each other).
 * Useful for selecting primary, secondary, and action colors that are visually distinct.
 */
export function getDistinctColors(colors: RGB[], count: number): RGB[] {
  if (colors.length <= count) return colors

  const selected: RGB[] = [getMostVibrant(colors)]

  while (selected.length < count) {
    let maxMinDistance = 0
    let nextColor = colors[0]

    for (const color of colors) {
      if (selected.some((s) => colorDistance(s, color) < 30)) continue

      const minDistance = Math.min(...selected.map((s) => colorDistance(s, color)))
      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance
        nextColor = color
      }
    }

    selected.push(nextColor)
  }

  return selected
}

/**
 * Calculate the Euclidean distance between two colors in RGB space.
 */
function colorDistance([r1, g1, b1]: RGB, [r2, g2, b2]: RGB): number {
  return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2))
}
