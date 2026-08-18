import { createContext, useContext } from "react"

export type ArtworkOverlaySize = { width: number; height: number }

/** Measured artwork bounds in px; overlay SVGs size to this instead of using percentages. */
export const ArtworkOverlaySizeContext = createContext<ArtworkOverlaySize | undefined>(undefined)

export function useArtworkOverlaySize(): ArtworkOverlaySize | undefined {
  return useContext(ArtworkOverlaySizeContext)
}
