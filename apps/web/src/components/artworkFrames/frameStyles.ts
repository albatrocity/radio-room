import type { SystemStyleObject } from "@chakra-ui/react"
import type { ArtworkFrame } from "@repo/types"

/** Punches a large-spindle hole through the artwork wrapper (45 picture sleeve). */
export const dieCutMaskStyles: SystemStyleObject = {
  WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent 20%, #000 20.5%)",
  maskImage: "radial-gradient(circle at 50% 50%, transparent 20%, #000 20.5%)",
}

/** Cassette case outer size in mm; `CassetteCaseOverlay` draws in these units. */
export const CASSETTE_CASE_MM = { width: 70, height: 110 } as const

/** Printed insert inside the case, in mm. Extra room on the left for the hinge. */
export const CASSETTE_INSERT_MM = { x: 4.5, y: 3, width: 62.5, height: 104 } as const

export type FrameContentRatio = { width: number; height: number }

/**
 * Fraction of the square artwork box the framed media actually occupies. Sleeves
 * and jewel cases are square, so they fill it; a cassette is cropped to a portrait
 * case so its silhouette reads as a tape.
 */
export function frameContentRatio(frame: ArtworkFrame): FrameContentRatio {
  return frame === "cassette-case"
    ? { width: CASSETTE_CASE_MM.width / CASSETTE_CASE_MM.height, height: 1 }
    : { width: 1, height: 1 }
}

export type FrameInset = { top: number; right: number; bottom: number; left: number }

const NO_INSET: FrameInset = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Fraction of the frame taken up by casing around the printed artwork. A sleeve
 * *is* the artwork, but a cassette case holds a smaller paper insert behind clear
 * plastic, so the cover has to sit inside the case rather than fill it.
 */
export function frameArtworkInset(frame: ArtworkFrame): FrameInset {
  if (frame !== "cassette-case") return NO_INSET
  const { width, height } = CASSETTE_CASE_MM
  const insert = CASSETTE_INSERT_MM
  return {
    top: insert.y / height,
    right: (width - insert.x - insert.width) / width,
    bottom: (height - insert.y - insert.height) / height,
    left: insert.x / width,
  }
}
