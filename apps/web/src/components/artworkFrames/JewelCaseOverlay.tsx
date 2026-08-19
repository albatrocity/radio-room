import OverlaySvg from "./OverlaySvg"
import { JEWEL_CASE_INSERT_MM, JEWEL_CASE_MM } from "./frameStyles"

type Props = {
  /** Unique id prefix for SVG defs (gradients). */
  idPrefix?: string
}

const CASE = JEWEL_CASE_MM
const INSERT = JEWEL_CASE_INSERT_MM
const INSERT_RIGHT = INSERT.x + INSERT.width
const INSERT_BOTTOM = INSERT.y + INSERT.height

/** Hinge strip left of the booklet, with a highlight along its inner edge. */
const SPINE_HIGHLIGHT = 1.5
const SPINE_WIDTH = INSERT.x - SPINE_HIGHLIGHT

/**
 * CD jewel case: hinge spine, plastic bevel, diagonal sheen. Drawn in case
 * millimetres; `frameArtworkInset` puts the cover art in the same window.
 */
export default function JewelCaseOverlay({ idPrefix = "jc" }: Props) {
  const sheenId = `${idPrefix}-sheen`
  const edgeId = `${idPrefix}-edge`

  return (
    <OverlaySvg viewBox={`0 0 ${CASE.width} ${CASE.height}`}>
      <defs>
        <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.3" />
          <stop offset="40%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={SPINE_WIDTH} height={CASE.height} fill="#000" opacity="0.35" />
      <rect
        x={SPINE_WIDTH}
        y="0"
        width={SPINE_HIGHLIGHT}
        height={CASE.height}
        fill="#fff"
        opacity="0.12"
      />

      <rect
        x="0.6"
        y="0.6"
        width={CASE.width - 1.2}
        height={CASE.height - 1.2}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <rect
        x="0.6"
        y="0.6"
        width={CASE.width - 1.2}
        height={CASE.height - 1.2}
        fill="none"
        stroke="#000"
        strokeOpacity="0.28"
        strokeWidth="0.7"
      />

      <rect
        x={INSERT.x}
        y={INSERT.y}
        width={INSERT.width}
        height={INSERT.height}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <rect
        x={INSERT.x}
        y={INSERT.y}
        width={INSERT.width}
        height={INSERT.height}
        fill="none"
        stroke="#000"
        strokeOpacity="0.2"
        strokeWidth="0.6"
      />

      <polygon
        points={`${INSERT.x},${INSERT.y} ${INSERT_RIGHT},${INSERT.y} ${INSERT_RIGHT - 25},${INSERT.y + 48} ${INSERT.x},${INSERT.y + 48}`}
        fill={`url(#${sheenId})`}
      />
      <polygon
        points={`${INSERT.x},${INSERT_BOTTOM - 48} ${INSERT.x + 60},${INSERT_BOTTOM - 48} ${INSERT.x + 40},${INSERT_BOTTOM - 25} ${INSERT.x},${INSERT_BOTTOM - 25}`}
        fill="#fff"
        opacity="0.08"
      />

      <rect
        x="0"
        y="0"
        width={CASE.width}
        height={CASE.height}
        fill={`url(#${edgeId})`}
        opacity="0.2"
      />
    </OverlaySvg>
  )
}
