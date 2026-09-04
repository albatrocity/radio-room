import type { MediaCondition } from "@repo/types"
import { useArtworkOverlayIsCompact } from "./ArtworkOverlaySizeContext"
import JewelCaseCrack from "./JewelCaseCrack"
import OverlaySvg from "./OverlaySvg"
import {
  JEWEL_CASE_BEVEL_MM,
  JEWEL_CASE_INSERT_MM,
  JEWEL_CASE_MM,
  JEWEL_CASE_SPINE_MM,
} from "./frameStyles"

type Props = {
  /** Unique id prefix for SVG defs (gradients). */
  idPrefix?: string
  /** No booklet cover: omit insert window chrome. */
  coverless?: boolean
  /** Mint is the pristine case; Good and Poor crack the lid (ADR 0157). */
  condition?: MediaCondition
}

const CASE = JEWEL_CASE_MM
const INSERT = JEWEL_CASE_INSERT_MM
const INSERT_RIGHT = INSERT.x + INSERT.width
const INSERT_BOTTOM = INSERT.y + INSERT.height

/** Opaque hinge spine; the clear lid starts at `SPINE_WIDTH`. */
const SPINE_WIDTH = JEWEL_CASE_SPINE_MM
const SPINE_BASE = "#23262b"
const SPINE_RIDGE = "#14171c"
const SPINE_RIDGE_SPACING = 1.05

/**
 * Outer shell bevel frames the lid only. Its left stroke edge sits on the spine
 * seam; top/right/bottom use the usual inset from the case edge.
 */
const BEVEL_LEFT = SPINE_WIDTH + JEWEL_CASE_BEVEL_MM.width / 2

const BEVEL_RECT = {
  x: BEVEL_LEFT,
  y: JEWEL_CASE_BEVEL_MM.offset,
  width: CASE.width - JEWEL_CASE_BEVEL_MM.offset - BEVEL_LEFT,
  height: CASE.height - JEWEL_CASE_BEVEL_MM.offset * 2,
} as const

/**
 * Clear lid the crack travels across. It stops at the spine seam because the
 * hinge is opaque moulded plastic, not the window that breaks.
 */
const CRACK_RECT = {
  x: SPINE_WIDTH,
  y: 0,
  width: CASE.width - SPINE_WIDTH,
  height: CASE.height,
} as const

const spineRidges = Array.from(
  { length: Math.ceil(SPINE_WIDTH / SPINE_RIDGE_SPACING) },
  (_, i) => i * SPINE_RIDGE_SPACING + 0.4,
)

/**
 * CD jewel case: opaque ridged spine, bevel, diagonal sheen. Tray, disc, and tabs
 * render on `JewelCaseUnderlay` beneath the cover art. Drawn in case
 * millimetres; `frameArtworkInset` puts the cover art in the same window.
 *
 * Condition shows in the plastic: Good takes a corner crack, Poor runs that same
 * crack to the far corner. Fading on the booklet is applied to the cover image
 * itself (`insertConditionFilter`), since the booklet is the image.
 */
export default function JewelCaseOverlay({
  idPrefix = "jc",
  coverless = false,
  condition = "mint",
}: Props) {
  const compact = useArtworkOverlayIsCompact()
  const sheenId = `${idPrefix}-sheen`
  const edgeId = `${idPrefix}-edge`
  const ridges = compact ? spineRidges.filter((_, i) => i % 3 === 1) : spineRidges

  return (
    <OverlaySvg viewBox={`0 0 ${CASE.width} ${CASE.height}`}>
      <defs>
        {!compact && (
          <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        )}
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.3" />
          <stop offset="40%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={SPINE_WIDTH} height={CASE.height} fill={SPINE_BASE} />
      {ridges.map((x) => (
        <line
          key={x}
          x1={x}
          y1={0}
          x2={x}
          y2={CASE.height}
          stroke={SPINE_RIDGE}
          strokeWidth={compact ? "0.9" : "0.45"}
        />
      ))}
      <line
        x1={SPINE_WIDTH}
        y1={0.8}
        x2={SPINE_WIDTH}
        y2={CASE.height - 0.8}
        stroke="#fff"
        strokeOpacity="0.14"
        strokeWidth="0.6"
      />

      <rect
        {...BEVEL_RECT}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth={JEWEL_CASE_BEVEL_MM.width}
      />
      <rect {...BEVEL_RECT} fill="none" stroke="#000" strokeOpacity="0.28" strokeWidth="0.7" />

      {!coverless && !compact && (
        <>
          <polygon
            points={`${INSERT.x},${INSERT.y} ${INSERT_RIGHT},${INSERT.y} ${INSERT_RIGHT - 25},${
              INSERT.y + 48
            } ${INSERT.x},${INSERT.y + 48}`}
            fill={`url(#${sheenId})`}
          />
          <polygon
            points={`${INSERT.x},${INSERT_BOTTOM - 48} ${INSERT.x + 60},${INSERT_BOTTOM - 48} ${
              INSERT.x + 40
            },${INSERT_BOTTOM - 25} ${INSERT.x},${INSERT_BOTTOM - 25}`}
            fill="#fff"
            opacity="0.08"
          />
        </>
      )}

      <rect
        x="0"
        y="0"
        width={CASE.width}
        height={CASE.height}
        fill={`url(#${edgeId})`}
        opacity="0.2"
      />

      {condition !== "mint" && (
        <JewelCaseCrack rect={CRACK_RECT} severity={condition} compact={compact} idPrefix={idPrefix} />
      )}
    </OverlaySvg>
  )
}
