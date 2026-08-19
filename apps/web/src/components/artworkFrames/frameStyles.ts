import type { SystemStyleObject } from "@chakra-ui/react"
import type { ArtworkFrame } from "@repo/types"

/** Punches a large-spindle hole through the artwork wrapper (45 picture sleeve). */
export const dieCutMaskStyles: SystemStyleObject = {
  WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent 20%, #000 20.5%)",
  maskImage: "radial-gradient(circle at 50% 50%, transparent 20%, #000 20.5%)",
}

/**
 * Row-sized framed media (shop, collection, Physical Media item list). Chakra
 * spacing token — 12 × 4px = 48px tall.
 */
export const FRAMED_ARTWORK_BOX_SIZE = 12

/** Track-row framed media (Physical Media after opening an item). */
export const FRAMED_ARTWORK_TRACK_PX = 100

export type ArtworkSizePreset = "row" | "track" | "feature"

/**
 * Layout size FramedArtwork applies for each named preset. `feature` fills its
 * parent (Now Playing supplies a square slot); row/track are fixed.
 */
export function framedArtworkLayout(size: ArtworkSizePreset): {
  boxSize?: number
  height?: string
  width?: string
} {
  switch (size) {
    case "row":
      return { boxSize: FRAMED_ARTWORK_BOX_SIZE }
    case "track":
      return { height: `${FRAMED_ARTWORK_TRACK_PX}px` }
    case "feature":
      return { width: "100%" }
  }
}

/**
 * Anchors framed media to the page. `drop-shadow` follows the element's alpha, so
 * cassette cases and die-cut 45s keep their silhouette (including the spindle hole).
 */
export const framedMediaShadow: SystemStyleObject = {
  filter:
    "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28)) drop-shadow(0 3px 6px rgba(0, 0, 0, 0.14))",
}

/** Cassette case outer size in mm; `CassetteCaseOverlay` draws in these units. */
export const CASSETTE_CASE_MM = { width: 70, height: 110 } as const

/**
 * Square front booklet plus the margins around it, in mm; `JewelCaseOverlay`
 * draws in these units. The case is only as wide as the booklet plus the hinge
 * spine, because the leftover width on this axis *is* the spine: a square insert
 * tight against the top/right/bottom edges leaves nothing else for it to be. A
 * real case is 142mm wide, but that forces a spine thick enough to dominate the
 * artwork at list sizes, so it is trimmed to stay legible.
 */
const JEWEL_CASE_BOOKLET_MM = 120
const JEWEL_CASE_MARGIN_MM = 2.5
const JEWEL_CASE_SPINE_MM = 13

export const JEWEL_CASE_INSERT_MM = {
  x: JEWEL_CASE_SPINE_MM,
  y: JEWEL_CASE_MARGIN_MM,
  width: JEWEL_CASE_BOOKLET_MM,
  height: JEWEL_CASE_BOOKLET_MM,
} as const

export const JEWEL_CASE_MM = {
  width: JEWEL_CASE_SPINE_MM + JEWEL_CASE_BOOKLET_MM + JEWEL_CASE_MARGIN_MM,
  height: JEWEL_CASE_MARGIN_MM * 2 + JEWEL_CASE_BOOKLET_MM,
} as const

/** Printed insert inside the case, in mm. Extra room on the left for the hinge. */
export const CASSETTE_INSERT_MM = { x: 4.5, y: 3, width: 62.5, height: 104 } as const

export type FrameContentRatio = { width: number; height: number }

/**
 * Aspect ratio of the physical object. Sleeves are square; jewel cases are
 * wider because of the spine; cassettes are portrait 70:110 cases.
 */
export function frameContentRatio(frame: ArtworkFrame): FrameContentRatio {
  if (frame === "jewel-case") {
    return { width: JEWEL_CASE_MM.width / JEWEL_CASE_MM.height, height: 1 }
  }
  return frame === "cassette-case"
    ? { width: CASSETTE_CASE_MM.width / CASSETTE_CASE_MM.height, height: 1 }
    : { width: 1, height: 1 }
}

export type FrameInset = { top: number; right: number; bottom: number; left: number }

const NO_INSET: FrameInset = { top: 0, right: 0, bottom: 0, left: 0 }

type MmBox = { width: number; height: number }
type MmInsert = { x: number; y: number; width: number; height: number }

/** Case-relative inset of a printed insert, from millimetre measurements. */
function insetFromMm(outer: MmBox, insert: MmInsert): FrameInset {
  return {
    top: insert.y / outer.height,
    right: (outer.width - insert.x - insert.width) / outer.width,
    bottom: (outer.height - insert.y - insert.height) / outer.height,
    left: insert.x / outer.width,
  }
}

/**
 * Fraction of the frame taken up by casing around the printed artwork. A sleeve
 * *is* the artwork, but jewel and cassette cases hold a smaller paper insert
 * behind clear plastic, so the cover has to sit inside the case rather than fill
 * it. The insert stays square in rendered pixels because the case's own aspect
 * cancels out: art width is `insert.width / case.width` of a box that is itself
 * `case.width / case.height` times as wide as it is tall.
 */
export function frameArtworkInset(frame: ArtworkFrame): FrameInset {
  if (frame === "jewel-case") return insetFromMm(JEWEL_CASE_MM, JEWEL_CASE_INSERT_MM)
  if (frame === "cassette-case") return insetFromMm(CASSETTE_CASE_MM, CASSETTE_INSERT_MM)
  return NO_INSET
}
