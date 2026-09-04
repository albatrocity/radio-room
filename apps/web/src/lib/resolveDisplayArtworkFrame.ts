import type { ArtworkFrame, MediaCondition, PhysicalMediaFormat } from "@repo/types"

/**
 * Client seam for per-condition Physical Media frames (ADR 0155).
 * Today every condition shares the mint frame; a later pass can diverge this table.
 */
const ARTWORK_FRAME_BY_FORMAT_AND_CONDITION: Record<
  PhysicalMediaFormat,
  Record<MediaCondition, ArtworkFrame>
> = {
  CD: { mint: "jewel-case", good: "jewel-case", poor: "jewel-case" },
  LP: { mint: "record-jacket", good: "record-jacket", poor: "record-jacket" },
  TAPE: { mint: "cassette-case", good: "cassette-case", poor: "cassette-case" },
  "45": { mint: "die-cut-jacket", good: "die-cut-jacket", poor: "die-cut-jacket" },
}

export function resolveDisplayArtworkFrame(params: {
  mediaFormat?: PhysicalMediaFormat
  condition?: MediaCondition
  artworkFrame?: ArtworkFrame
}): ArtworkFrame | undefined {
  const { mediaFormat, condition, artworkFrame } = params
  if (mediaFormat && condition) {
    return ARTWORK_FRAME_BY_FORMAT_AND_CONDITION[mediaFormat][condition]
  }
  return artworkFrame
}
