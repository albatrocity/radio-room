import { useArtworkOverlayIsCompact } from "./ArtworkOverlaySizeContext"
import OverlaySvg from "./OverlaySvg"
import { CASSETTE_CASE_MM, CASSETTE_INSERT_MM } from "./frameStyles"

type Props = {
  /** Unique id prefix for SVG defs (gradients). */
  idPrefix?: string
}

const CASE = CASSETTE_CASE_MM
const INSERT = CASSETTE_INSERT_MM
const INSERT_RIGHT = INSERT.x + INSERT.width
const INSERT_BOTTOM = INSERT.y + INSERT.height

/** Clear plastic shell: the whole case minus the window the paper insert sits in. */
const SHELL_PATH = [
  `M0,0 H${CASE.width} V${CASE.height} H0 Z`,
  `M${INSERT.x},${INSERT.y} H${INSERT_RIGHT} V${INSERT_BOTTOM} H${INSERT.x} Z`,
].join(" ")

/**
 * Cassette jewel case: a clear plastic shell holding a smaller printed insert,
 * with a hinge spine and shrink wrap sheen. Drawn in case millimetres;
 * `frameArtworkInset` keeps the cover art inside the same window.
 */
export default function CassetteCaseOverlay({ idPrefix = "cc" }: Props) {
  const compact = useArtworkOverlayIsCompact()
  const plasticId = `${idPrefix}-plastic`
  const sheenId = `${idPrefix}-sheen`
  const wrapId = `${idPrefix}-wrap`
  const edgeId = `${idPrefix}-edge`

  return (
    <OverlaySvg viewBox={`0 0 ${CASE.width} ${CASE.height}`}>
      <defs>
        <linearGradient id={plasticId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#dfe6ec" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#b3bec9" stopOpacity="0.38" />
        </linearGradient>
        {!compact && (
          <>
            <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.42" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={wrapId} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </>
        )}
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.26" />
          <stop offset="45%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      <path d={SHELL_PATH} fillRule="evenodd" fill={`url(#${plasticId})`} />

      <rect
        x="0.35"
        y="0.35"
        width={CASE.width - 0.7}
        height={CASE.height - 0.7}
        fill="none"
        stroke="#000"
        strokeOpacity="0.38"
        strokeWidth="0.7"
      />
      <rect
        x="1.3"
        y="1.3"
        width={CASE.width - 2.6}
        height={CASE.height - 2.6}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="0.8"
      />

      <rect x="0" y="0" width="2.2" height={CASE.height} fill="#000" opacity="0.2" />
      <line
        x1="2.7"
        y1="1.3"
        x2="2.7"
        y2={CASE.height - 1.3}
        stroke="#fff"
        strokeOpacity="0.32"
        strokeWidth="0.5"
      />
      <line
        x1={CASE.width - 2.4}
        y1="1.3"
        x2={CASE.width - 2.4}
        y2={CASE.height - 1.3}
        stroke="#fff"
        strokeOpacity="0.2"
        strokeWidth="0.45"
      />

      <rect
        x={INSERT.x - 0.8}
        y={INSERT.y - 0.8}
        width={INSERT.width + 1.6}
        height={INSERT.height + 1.6}
        fill="none"
        stroke="#000"
        strokeOpacity="0.16"
        strokeWidth="1.6"
      />
      <rect
        x={INSERT.x}
        y={INSERT.y}
        width={INSERT.width}
        height={INSERT.height}
        fill="none"
        stroke="#000"
        strokeOpacity="0.32"
        strokeWidth="0.5"
      />

      {!compact && (
        <>
          <polygon points="1.3,1.3 34,1.3 13,52 1.3,52" fill={`url(#${sheenId})`} />
          <polygon
            points={`44,1.3 ${CASE.width - 1.3},1.3 ${CASE.width - 1.3},24 26,${CASE.height - 1.3} 12,${CASE.height - 1.3}`}
            fill={`url(#${wrapId})`}
          />
          <line x1="3" y1="34" x2={CASE.width - 3} y2="26" stroke="#fff" strokeOpacity="0.13" strokeWidth="0.5" />
          <line x1="3" y1="72" x2={CASE.width - 3} y2="80" stroke="#fff" strokeOpacity="0.1" strokeWidth="0.45" />
        </>
      )}

      <rect x="0" y="0" width={CASE.width} height={CASE.height} fill={`url(#${edgeId})`} />
    </OverlaySvg>
  )
}
