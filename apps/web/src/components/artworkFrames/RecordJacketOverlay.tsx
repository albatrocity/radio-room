import OverlaySvg from "./OverlaySvg"

type Props = {
  /** Unique id prefix for SVG defs (filters, gradients). */
  idPrefix?: string
}

/** Worn LP jacket: corner fade, faint ring wear, grain, hairline scratches. */
export default function RecordJacketOverlay({ idPrefix = "rj" }: Props) {
  const filterId = `${idPrefix}-grain`
  return (
    <OverlaySvg>
      <defs>
        <radialGradient id={`${idPrefix}-cornerTL`} cx="0" cy="0" r="0.55">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-cornerBR`} cx="1" cy="1" r="0.5">
          <stop offset="0%" stopColor="#000" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <filter id={filterId} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="mono" />
          <feBlend in="SourceGraphic" in2="mono" mode="multiply" />
        </filter>
      </defs>
      <rect x="0" y="0" width="55" height="55" fill={`url(#${idPrefix}-cornerTL)`} opacity="0.35" />
      <rect x="45" y="45" width="55" height="55" fill={`url(#${idPrefix}-cornerBR)`} opacity="0.3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#000" strokeOpacity="0.06" strokeWidth="2" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="#000" strokeOpacity="0.04" strokeWidth="1.5" />
      <line x1="12" y1="78" x2="88" y2="72" stroke="#fff" strokeOpacity="0.08" strokeWidth="0.6" />
      <line x1="8" y1="42" x2="35" y2="38" stroke="#000" strokeOpacity="0.15" strokeWidth="0.5" />
      <line x1="70" y1="18" x2="92" y2="28" stroke="#fff" strokeOpacity="0.06" strokeWidth="0.5" />
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="#888"
        opacity="0.08"
        filter={`url(#${filterId})`}
        style={{ mixBlendMode: "multiply" }}
      />
    </OverlaySvg>
  )
}
