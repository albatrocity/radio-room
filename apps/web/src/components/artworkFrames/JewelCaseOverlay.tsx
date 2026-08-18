import OverlaySvg from "./OverlaySvg"

type Props = {
  /** Unique id prefix for SVG defs (gradients). */
  idPrefix?: string
}

/** CD jewel case: spine, plastic bevel, diagonal sheen. */
export default function JewelCaseOverlay({ idPrefix = "jc" }: Props) {
  const sheenId = `${idPrefix}-sheen`
  const edgeId = `${idPrefix}-edge`

  return (
    <OverlaySvg>
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
      <rect x="0" y="0" width="8" height="100" fill="#000" opacity="0.35" />
      <rect x="8" y="0" width="2" height="100" fill="#fff" opacity="0.12" />
      <rect
        x="10"
        y="2"
        width="88"
        height="96"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <rect
        x="10"
        y="2"
        width="88"
        height="96"
        fill="none"
        stroke="#000"
        strokeOpacity="0.2"
        strokeWidth="0.5"
      />
      <polygon points="12,4 88,4 70,45 12,45" fill={`url(#${sheenId})`} />
      <polygon points="12,54 58,54 42,74 12,74" fill="#fff" opacity="0.08" />
      <line x1="14" y1="6" x2="82" y2="6" stroke="#fff" strokeOpacity="0.3" strokeWidth="0.8" />
      <rect x="0" y="0" width="100" height="100" fill={`url(#${edgeId})`} opacity="0.2" />
    </OverlaySvg>
  )
}
