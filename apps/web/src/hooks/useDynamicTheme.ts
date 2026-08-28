/**
 * Dynamic Theme Hook
 *
 * Extracts colors from album artwork and applies them as CSS custom properties
 * when the "dynamic" theme is selected.
 *
 * Artwork URL is provided via a shared store so both Lobby and Room can drive
 * color extraction.
 */

import { useEffect, useRef, useSyncExternalStore } from "react"
import { useCurrentTheme } from "./useActors"
import { extractColors, getDistinctColors } from "../lib/colorExtractor"
import { generateDynamicPalette, type DynamicPalette } from "../lib/paletteGenerator"
import type { ColorHues } from "../types/AppTheme"
import { syncBrowserThemeColorFromCss } from "../lib/browserThemeColor"

// CSS variable prefix for Chakra UI v3
const CSS_VAR_PREFIX = "--chakra-colors"

// Shades used in the theme
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

// Color categories
const CATEGORIES = ["primary", "secondary", "action"] as const

/** How long `html[data-theme-morphing]` stays set after applyPalette (matches 1s CSS morph). */
const THEME_MORPH_MS = 1000

let themeMorphTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Briefly lengthen theme color transitions while a new dynamic palette settles.
 * Rearms if another apply lands mid-window.
 */
function beginThemeMorph(durationMs = THEME_MORPH_MS): void {
  const root = document.documentElement
  root.setAttribute("data-theme-morphing", "")
  if (themeMorphTimeout != null) {
    clearTimeout(themeMorphTimeout)
  }
  themeMorphTimeout = setTimeout(() => {
    root.removeAttribute("data-theme-morphing")
    themeMorphTimeout = null
  }, durationMs)
}

// ============================================================================
// Shared Artwork URL Store
// ============================================================================

type ArtworkListener = () => void

let currentArtworkUrl: string | null = null
const artworkListeners = new Set<ArtworkListener>()

export function setCurrentArtworkUrl(url: string | null): void {
  if (url === currentArtworkUrl) return
  currentArtworkUrl = url
  artworkListeners.forEach((listener) => listener())
}

function subscribeArtwork(listener: ArtworkListener): () => void {
  artworkListeners.add(listener)
  return () => artworkListeners.delete(listener)
}

function getArtworkSnapshot(): string | null {
  return currentArtworkUrl
}

/**
 * Hook to access the current artwork URL used for dynamic theme extraction.
 */
export function useCurrentArtworkUrl(): string | null {
  return useSyncExternalStore(subscribeArtwork, getArtworkSnapshot, getArtworkSnapshot)
}

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
 * Apply a color palette to the document as CSS custom properties.
 * Sets variables like: --chakra-colors-dynamic-primary-500
 */
function applyPalette(palette: DynamicPalette): void {
  beginThemeMorph()
  const root = document.documentElement

  for (const category of CATEGORIES) {
    const shades = palette[category] as ColorHues

    for (const shade of SHADES) {
      const value = shades[shade]
      const varName = `${CSS_VAR_PREFIX}-dynamic-${category}-${shade}`
      root.style.setProperty(varName, value)
    }
  }

  syncBrowserThemeColorFromCss()
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

  syncBrowserThemeColorFromCss()
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
  const artworkUrl = useCurrentArtworkUrl()
  const lastArtworkRef = useRef<string | null>(null)
  const isDynamic = currentTheme === "dynamic"

  useEffect(() => {
    if (!artworkUrl || artworkUrl === lastArtworkRef.current) {
      return
    }

    let cancelled = false

    const run = () => {
      if (cancelled || document.hidden) return
      extractColors(artworkUrl, 8).then((extracted) => {
        if (cancelled) return

        if (!extracted) {
          console.warn("Could not extract colors from artwork")
          return
        }

        lastArtworkRef.current = artworkUrl

        const allColors = [extracted.dominant, ...extracted.palette]
        const distinctColors = getDistinctColors(allColors, 5)
        const palette = generateDynamicPalette(distinctColors)

        setPalette(palette)

        if (currentTheme === "dynamic") {
          applyPalette(palette)
        }
      })
    }

    run()
    const onVisible = () => {
      if (!document.hidden) run()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [artworkUrl, currentTheme])

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
