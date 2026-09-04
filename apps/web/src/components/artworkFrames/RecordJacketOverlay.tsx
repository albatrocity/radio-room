import type { MediaCondition } from "@repo/types"
import { useArtworkOverlayIsCompact } from "./ArtworkOverlaySizeContext"
import OverlaySvg from "./OverlaySvg"
import { CORNER_DENT_EDGE } from "./frameStyles"

type Props = {
  /** Unique id prefix for SVG defs (filters, gradients). */
  idPrefix?: string
  /** Good is the shelf-worn sleeve this overlay was built around (ADR 0157). */
  condition?: MediaCondition
}

/**
 * How hard the cardboard has been lived on. Good is the original tuning, so a
 * sleeve with no condition attached still looks the way it always did once you
 * account for Mint being the default — see ADR 0157.
 */
const WEAR = {
  mint: {
    cornerTL: 0.22,
    cornerBR: 0.18,
    discOpacity: { compact: 0.045, full: 0.022 },
    scuff: null,
    edgeRub: 0.3,
    spine: 0.13,
  },
  good: {
    cornerTL: 0.35,
    cornerBR: 0.3,
    discOpacity: { compact: 0.08, full: 0.045 },
    scuff: { opacity: 0.55, edge: 20, ring: 11 },
    edgeRub: 0.5,
    spine: 0.22,
  },
  poor: {
    cornerTL: 0.5,
    cornerBR: 0.44,
    discOpacity: { compact: 0.11, full: 0.065 },
    scuff: { opacity: 0.72, edge: 30, ring: 16 },
    edgeRub: 0.72,
    spine: 0.32,
  },
} as const satisfies Record<MediaCondition, unknown>

const DENT = CORNER_DENT_EDGE
const DENT_EDGE_PATH = DENT.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")

/**
 * Shading for the knocked-in corner `cornerDentClipStyles` cuts away. The wedge
 * darkens the fold, the pale stroke is the board exposed where the print tore,
 * and the two creases run the crush back into the sleeve. Drawn past the cut
 * line on purpose — the wrapper's clip trims it.
 */
function CornerDent() {
  return (
    <g>
      <polygon
        points={`${DENT[0].x},${DENT[0].y} ${DENT[1].x},${DENT[1].y} ${DENT[2].x},${DENT[2].y} 100,19 78,0`}
        fill="#000"
        opacity="0.2"
      />
      <path d={DENT_EDGE_PATH} fill="none" stroke="#f2e8d8" strokeOpacity="0.72" strokeWidth="2" />
      <path
        d={`M${DENT[1].x},${DENT[1].y} L82.5,12.5`}
        fill="none"
        stroke="#f2e8d8"
        strokeOpacity="0.34"
        strokeWidth="0.9"
      />
      <path
        d={`M${DENT[2].x},${DENT[2].y} L91,17.5`}
        fill="none"
        stroke="#f2e8d8"
        strokeOpacity="0.22"
        strokeWidth="0.8"
      />
    </g>
  )
}

/**
 * LP jacket: ring wear, paper-coating scuffs, edge rub, grain — all scaled by
 * condition. Mint drops the scuffs and adds a faint satin sheen; Poor lays the
 * wear on and loses a corner to `cornerDentClipStyles` on the wrapper.
 * Wear stays on edges and the disc ring so it reads as the cardboard sleeve.
 * Compact (row/track) skips turbulence and mix-blend — those resample at small
 * CSS sizes and flicker.
 */
export default function RecordJacketOverlay({ idPrefix = "rj", condition = "mint" }: Props) {
  const compact = useArtworkOverlayIsCompact()
  const grainId = `${idPrefix}-grain`
  const discBlurId = `${idPrefix}-discBlur`
  const scuffId = `${idPrefix}-scuff`
  const wearMaskId = `${idPrefix}-wearMask`
  const edgeRubId = `${idPrefix}-edgeRub`
  const sheenId = `${idPrefix}-sheen`

  const wear = WEAR[condition]
  const scuff = compact ? null : wear.scuff
  const showSheen = condition === "mint" && !compact

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
        <linearGradient id={edgeRubId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4eee4" stopOpacity="0.22" />
          <stop offset="50%" stopColor="#f4eee4" stopOpacity="0" />
          <stop offset="100%" stopColor="#f4eee4" stopOpacity="0.16" />
        </linearGradient>
        {showSheen && (
          <linearGradient id={sheenId} x1="0.1" y1="0" x2="0.75" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="38%" stopColor="#fff" stopOpacity="0.14" />
            <stop offset="52%" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        )}
        {!compact && (
          <>
            <filter
              id={grainId}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="100"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="2"
                seed="3"
                result="noise"
              />
              <feColorMatrix type="saturate" values="0" in="noise" result="mono" />
              <feBlend in="SourceGraphic" in2="mono" mode="multiply" />
            </filter>
            <filter
              id={discBlurId}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x="-20"
              y="-20"
              width="140"
              height="140"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" />
            </filter>
          </>
        )}
        {scuff && (
          <>
            <filter
              id={scuffId}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="100"
              colorInterpolationFilters="sRGB"
            >
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
                strokeWidth={scuff.edge}
              />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#ddd" strokeWidth={scuff.ring} />
              {condition === "poor" && (
                <>
                  <circle cx="50" cy="50" r="30" fill="none" stroke="#888" strokeWidth="9" />
                  <path
                    d="M6 78 L34 96"
                    fill="none"
                    stroke="#bbb"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                </>
              )}
            </mask>
          </>
        )}
      </defs>

      <rect
        x="0"
        y="0"
        width="55"
        height="55"
        fill={`url(#${idPrefix}-cornerTL)`}
        opacity={wear.cornerTL}
      />
      <rect
        x="45"
        y="45"
        width="55"
        height="55"
        fill={`url(#${idPrefix}-cornerBR)`}
        opacity={wear.cornerBR}
      />

      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#000"
        strokeOpacity={compact ? wear.discOpacity.compact : wear.discOpacity.full}
        strokeWidth={compact ? "2.2" : "3.5"}
        filter={compact ? undefined : `url(#${discBlurId})`}
      />

      {scuff && (
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="#f0e6d4"
          filter={`url(#${scuffId})`}
          mask={`url(#${wearMaskId})`}
          opacity={scuff.opacity}
          style={{ mixBlendMode: "screen" }}
        />
      )}

      {showSheen && <rect x="0" y="0" width="100" height="100" fill={`url(#${sheenId})`} />}

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
        style={compact ? undefined : { mixBlendMode: "overlay" }}
      />
      <rect x="0" y="0" width="100" height="100" fill={`url(#${edgeRubId})`} opacity={wear.edgeRub} />

      <rect x="98.2" y="4" width="1.8" height="92" fill="#c9bba8" opacity={wear.spine} />

      {condition === "poor" && <CornerDent />}

      {!compact && (
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
      )}
    </OverlaySvg>
  )
}
