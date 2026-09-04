import type { ArtworkFrame, MediaCondition, PhysicalMediaFormat } from "@repo/types"
import { artworkFrameForFormat } from "@repo/types"

/**
 * A frame names the physical object, not its state: every condition of a format
 * resolves to the same token, and wear is drawn by passing `MediaCondition`
 * alongside it (ADR 0157).
 */
export function resolveDisplayArtworkFrame(params: {
  mediaFormat?: PhysicalMediaFormat
  condition?: MediaCondition
  artworkFrame?: ArtworkFrame
}): ArtworkFrame | undefined {
  const { mediaFormat, condition, artworkFrame } = params
  if (mediaFormat) {
    return artworkFrameForFormat(mediaFormat, condition ?? "mint")
  }
  return artworkFrame
}
