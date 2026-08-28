import { createContext, useContext } from "react"

export type ArtworkOverlaySize = { width: number; height: number }

/**
 * Below this, overlay SVGs drop turbulence / sheen / mix-blend. Those filters
 * resample every time a subpixel layout shift hits a small box and look like
 * flicker (row thumbs, shop, inventory, trade chips).
 */
export const ARTWORK_OVERLAY_FULL_DETAIL_MIN_PX = 160

export function artworkOverlayIsCompact(size: ArtworkOverlaySize | undefined): boolean {
  if (!size) return false
  return Math.min(size.width, size.height) < ARTWORK_OVERLAY_FULL_DETAIL_MIN_PX
}

/**
 * Approximate artwork bounds for overlay detail (not used to size the SVG).
 * Row/track pass a small hint; feature omits it so the full overlay draws.
 */
export const ArtworkOverlaySizeContext = createContext<ArtworkOverlaySize | undefined>(undefined)

export function useArtworkOverlaySize(): ArtworkOverlaySize | undefined {
  return useContext(ArtworkOverlaySizeContext)
}

export function useArtworkOverlayIsCompact(): boolean {
  return artworkOverlayIsCompact(useArtworkOverlaySize())
}
