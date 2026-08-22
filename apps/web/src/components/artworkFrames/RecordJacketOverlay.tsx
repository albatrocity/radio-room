import OverlaySvg from "./OverlaySvg"

type Props = {
  /** Unique id prefix for SVG defs (filters, gradients). */
  idPrefix?: string
}

/**
 * Worn LP jacket: ring wear, crushed corner, paper-coating scuffs, grain.
 * Wear is localized to edges, the disc ring, and a bent corner so it reads as
 * the cardboard sleeve — not stray lines across the artwork.
 */
export default function RecordJacketOverlay({ idPrefix = "rj" }: Props) {
  const grainId = `${idPrefix}-grain`
  const discBlurId = `${idPrefix}-discBlur`
  const scuffId = `${idPrefix}-scuff`
  const wearMaskId = `${idPrefix}-wearMask`
  const flapLightId = `${idPrefix}-flapLight`
  const edgeRubId = `${idPrefix}-edgeRub`

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
        <linearGradient id={flapLightId} x1="1" y1="1" x2="0.62" y2="0.62">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id={edgeRubId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4eee4" stopOpacity="0.22" />
          <stop offset="50%" stopColor="#f4eee4" stopOpacity="0" />
          <stop offset="100%" stopColor="#f4eee4" stopOpacity="0.16" />
        </linearGradient>
        <filter id={grainId} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="mono" />
          <feBlend in="SourceGraphic" in2="mono" mode="multiply" />
        </filter>
        <filter
          id={discBlurId}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" />
        </filter>
        {/* Sparse cream specks: print coating worn through to paper fiber. */}
        <filter id={scuffId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" seed="8" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0.96
                    0 0 0 0 0.93
                    0 0 0 0 0.86
                    7 0 0 0 -5.1"
          />
        </filter>
        <mask id={wearMaskId} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="100" height="100" fill="#111" />
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="none"
            stroke="#fff"
            strokeWidth="20"
          />
          <circle cx="50" cy="50" r="45" fill="none" stroke="#ddd" strokeWidth="11" />
          <polygon points="58,100 100,58 100,100" fill="#fff" />
          <polygon points="0,0 20,0 0,22" fill="#ccc" />
        </mask>
      </defs>

      <rect x="0" y="0" width="55" height="55" fill={`url(#${idPrefix}-cornerTL)`} opacity="0.35" />
      <rect x="45" y="45" width="55" height="55" fill={`url(#${idPrefix}-cornerBR)`} opacity="0.3" />

      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#000"
        strokeOpacity="0.045"
        strokeWidth="3.5"
        filter={`url(#${discBlurId})`}
      />

      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="#f0e6d4"
        filter={`url(#${scuffId})`}
        mask={`url(#${wearMaskId})`}
        opacity="0.55"
        style={{ mixBlendMode: "screen" }}
      />

      <rect
        x="0.4"
        y="0.4"
        width="99.2"
        height="99.2"
        fill="none"
        stroke="#000"
        strokeOpacity="0.16"
        strokeWidth="0.8"
      />
      <rect
        x="1.1"
        y="1.1"
        width="97.8"
        height="97.8"
        fill="none"
        stroke="#f3eadc"
        strokeOpacity="0.28"
        strokeWidth="1.4"
        style={{ mixBlendMode: "overlay" }}
      />
      <rect x="0" y="0" width="100" height="100" fill={`url(#${edgeRubId})`} opacity="0.5" />

      {/* Mouth of the sleeve: cardboard layers at the right edge. */}
      <rect x="98.2" y="4" width="1.8" height="92" fill="#c9bba8" opacity="0.22" />

      {/* Crushed bottom-right corner: flap lifted toward the light, crease as a ridge. */}
      <polygon points="68,100 100,66 100,80 84,100" fill="#000" opacity="0.18" />
      <polygon points="74,100 100,74 100,100" fill={`url(#${flapLightId})`} />
      <path
        d="M73,100 Q88.5,86.5 100,73"
        fill="none"
        stroke="#000"
        strokeOpacity="0.32"
        strokeWidth="0.95"
        strokeLinecap="round"
      />
      <path
        d="M75.2,100 Q89.2,87.2 100,75.2"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
      {/* Print coating cracked along the fold — short ticks, not cover-spanning lines. */}
      <path
        d="M79,95.5 L81.2,92.8"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.42"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      <path
        d="M86.5,88.2 L89,85.2"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.36"
        strokeWidth="0.35"
        strokeLinecap="round"
      />
      <path
        d="M93.8,81.2 L96.2,78.4"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.3"
        strokeWidth="0.32"
        strokeLinecap="round"
      />

      {/* Smaller top-left ding from bin wear. */}
      <polygon points="0,0 16,0 0,18" fill="#000" opacity="0.12" />
      <path
        d="M0,15.5 Q7.2,7.2 15.5,0"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.22"
        strokeWidth="0.45"
        strokeLinecap="round"
      />
      <path
        d="M0,13.8 Q6.5,6.5 13.8,0"
        fill="none"
        stroke="#000"
        strokeOpacity="0.16"
        strokeWidth="0.4"
        strokeLinecap="round"
      />

      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="#888"
        opacity="0.08"
        filter={`url(#${grainId})`}
        style={{ mixBlendMode: "multiply" }}
      />
    </OverlaySvg>
  )
}
