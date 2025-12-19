/**
 * Dynamic Theme Hook
 *
 * Extracts colors from album artwork and applies them as CSS custom properties
 * when the "dynamic" theme is selected.
 */

import { useEffect, useRef, useSyncExternalStore } from "react"
import { useCurrentTheme, useNowPlaying } from "./useActors"
import { extractColors, getDistinctColors } from "../lib/colorExtractor"
import { generateDynamicPalette, type DynamicPalette } from "../lib/paletteGenerator"
import type { ColorHues } from "../types/AppTheme"

// CSS variable prefix for Chakra UI v3
const CSS_VAR_PREFIX = "--chakra-colors"

// Shades used in the theme
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

// Color categories
const CATEGORIES = ["primary", "secondary", "action"] as const

// ============================================================================
// Shared Palette Store
// ============================================================================

type PaletteListener = () => void

let currentPalette: DynamicPalette | null = null
const listeners = new Set<PaletteListener>()

function setPalette(palette: DynamicPalette | null): void {
  currentPalette = palette
  listeners.forEach((listener) => listener())
}

function subscribe(listener: PaletteListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): DynamicPalette | null {
  return currentPalette
}

/**
 * Hook to access the current dynamic palette colors.
 * Returns null if no colors have been extracted yet.
 */
export function useDynamicPalette(): DynamicPalette | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Get the album artwork URL from the now playing track.
 */
function getArtworkUrl(nowPlaying: ReturnType<typeof useNowPlaying>): string | null {
  if (!nowPlaying) return null

  const track = nowPlaying.track

  if (!track?.album?.images?.length) return null

  const firstImage = track.album.images[0]

  // New adapter format has { type, url, id }
  if (typeof firstImage === "object" && firstImage.url) {
    return firstImage.url
  }

  // Old Spotify format has direct URL
  if (typeof firstImage === "string") {
    return firstImage
  }

  return null
}

/**
 * Apply a color palette to the document as CSS custom properties.
 * Sets variables like: --chakra-colors-dynamic-primary-500
 */
function applyPalette(palette: DynamicPalette): void {
  const root = document.documentElement

  for (const category of CATEGORIES) {
    const shades = palette[category] as ColorHues

    for (const shade of SHADES) {
      const value = shades[shade]
      const varName = `${CSS_VAR_PREFIX}-dynamic-${category}-${shade}`
      root.style.setProperty(varName, value)
    }
  }
}

/**
 * Clear all dynamic theme CSS custom properties.
 */
function clearPalette(): void {
  const root = document.documentElement

  for (const category of CATEGORIES) {
    for (const shade of SHADES) {
      const varName = `${CSS_VAR_PREFIX}-dynamic-${category}-${shade}`
      root.style.removeProperty(varName)
    }
  }
}

/**
 * Hook that manages dynamic theme colors.
 *
 * - Always extracts colors from album artwork (for theme preview)
 * - Applies CSS custom properties only when "dynamic" theme is active
 *
 * Cleans up CSS variables when switching away from dynamic theme.
 */
export function useDynamicTheme(): void {
  const currentTheme = useCurrentTheme()
  const nowPlaying = useNowPlaying()
  const lastArtworkRef = useRef<string | null>(null)
  const isDynamic = currentTheme === "dynamic"

  // Extract colors whenever artwork changes (for preview and active use)
  useEffect(() => {
    const artworkUrl = getArtworkUrl(nowPlaying)

    // Skip if no artwork or same artwork as before
    if (!artworkUrl || artworkUrl === lastArtworkRef.current) {
      return
    }

    lastArtworkRef.current = artworkUrl

    // Extract colors and generate palette
    extractColors(artworkUrl, 8).then((extracted) => {
      if (!extracted) {
        console.warn("Could not extract colors from artwork")
        return
      }

      // Combine dominant and palette colors, then get distinct ones
      const allColors = [extracted.dominant, ...extracted.palette]
      const distinctColors = getDistinctColors(allColors, 5)

      // Generate the full palette
      const palette = generateDynamicPalette(distinctColors)

      // Store palette for preview access
      setPalette(palette)

      // Apply to CSS only if dynamic theme is active
      if (currentTheme === "dynamic") {
        applyPalette(palette)
      }
    })
  }, [nowPlaying, currentTheme])

  // Apply/remove CSS variables when theme changes
  useEffect(() => {
    if (isDynamic && currentPalette) {
      applyPalette(currentPalette)
    } else if (!isDynamic) {
      clearPalette()
    }
  }, [isDynamic])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPalette()
    }
  }, [])
}
