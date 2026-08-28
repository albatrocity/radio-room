import { useEffect, useState } from "react"
import { useArtworkOverlayIsCompact } from "./ArtworkOverlaySizeContext"
import OverlaySvg from "./OverlaySvg"
import {
  DISC_LABEL_PATH_RADIUS,
  fitDiscLabel,
} from "../../lib/fitDiscLabel"
import { discLabelFontStyles, loadDiscLabelFont } from "../../lib/discLabelFont"
import {
  JEWEL_CASE_BEVEL_INNER_MM,
  JEWEL_CASE_INSERT_MM,
  JEWEL_CASE_MM,
  JEWEL_CASE_SPINE_MM,
} from "./frameStyles"

type Props = {
  /** Unique id prefix for SVG defs (gradients). */
  idPrefix?: string
  /** Hand-lettered title on the disc when there is no booklet cover. */
  label?: string
}

const CASE = JEWEL_CASE_MM
const INSERT = JEWEL_CASE_INSERT_MM
const INSERT_RIGHT = INSERT.x + INSERT.width
const INSERT_BOTTOM = INSERT.y + INSERT.height

const SPINE_WIDTH = JEWEL_CASE_SPINE_MM
const FRONT_PANEL = {
  x: SPINE_WIDTH,
  y: 0,
  width: CASE.width - SPINE_WIDTH,
  height: CASE.height,
} as const

/** Standard CD diameter in mm; sits on the tray behind the square booklet. */
const DISC_RADIUS = 56
const DISC_CX = INSERT.x + INSERT.width / 2
const DISC_CY = INSERT.y + INSERT.height / 2

const TRAY_BASE = "#1c1f24"
const TRAY_EDGE = "#121418"

const HUB_OUTER = 7.8
const HUB_INNER = 2.4

/**
 * Spindle fingers that grip the disc. They are wide enough to leave only narrow
 * slots between them, so the recess behind reads as thin dark lines.
 */
const HUB_TOOTH_COUNT = 12
const HUB_TOOTH_WIDTH = 2
const HUB_TOOTH_COLOR = "#343941"
const HUB_SPINDLE_COLOR = "#070809"

/**
 * Red Book radii in mm. The recordable surface stops well short of the spindle
 * hole: the clamping area is bare polycarbonate, ringed by a narrow mirror band
 * before the data area begins.
 */
const DISC_CLAMP_RADIUS = 10.6
const DISC_MIRROR_RADIUS = 17.5
const DISC_DATA_INNER_RADIUS = 23

/** Interior-aligned rim: drawn inset so the stroke stays inside the disc edge. */
const DISC_RIM_WIDTH = 0.7

/** Clear-plastic clips anchored to the outer top/bottom lip of the case. */
const TAB_RADIUS = 4.8
const TAB_OFFSET = 21

const TAB_STROKE_WIDTH = 0.2

/** Open arc only: the flat chord sits against the case lip and is not stroked. */
const tabArc = (cx: number, y: number, sweep: 0 | 1) =>
  `M ${cx - TAB_RADIUS} ${y} A ${TAB_RADIUS} ${TAB_RADIUS} 0 0 ${sweep} ${cx + TAB_RADIUS} ${y}`

const topTabArc = (cx: number) => tabArc(cx, JEWEL_CASE_BEVEL_INNER_MM, 0)
const bottomTabArc = (cx: number) =>
  tabArc(cx, CASE.height - JEWEL_CASE_BEVEL_INNER_MM, 1)

const hubTeeth = Array.from({ length: HUB_TOOTH_COUNT }, (_, i) => {
  const angle = (i / HUB_TOOTH_COUNT) * Math.PI * 2
  const inner = HUB_INNER + 0.2
  const outer = HUB_OUTER - HUB_TOOTH_WIDTH / 2
  return {
    x1: DISC_CX + Math.cos(angle) * inner,
    y1: DISC_CY + Math.sin(angle) * inner,
    x2: DISC_CX + Math.cos(angle) * outer,
    y2: DISC_CY + Math.sin(angle) * outer,
  }
})

/**
 * Four 90° sectors from the hub, split on the diagonals so each wedge is
 * centred on an axis: the left and right wedges point sideways and can carry a
 * horizontal reflection, the top and bottom wedges stay flat.
 */
function discSector(startDeg: number, endDeg: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    return `${DISC_CX + Math.cos(rad) * DISC_RADIUS} ${DISC_CY + Math.sin(rad) * DISC_RADIUS}`
  }
  return `M ${DISC_CX} ${DISC_CY} L ${point(
    startDeg,
  )} A ${DISC_RADIUS} ${DISC_RADIUS} 0 0 1 ${point(endDeg)} Z`
}

const discTopSector = discSector(-135, -45)
const discRightSector = discSector(-45, 45)
const discBottomSector = discSector(45, 135)
const discLeftSector = discSector(135, 225)

/**
 * Ring centred on the disc. The two circles are wound in opposite directions so
 * the inner one cuts a hole under the default non-zero fill rule.
 */
function discRing(outerRadius: number, innerRadius: number): string {
  const circle = (r: number, sweep: 0 | 1) =>
    `M ${DISC_CX - r} ${DISC_CY} A ${r} ${r} 0 1 ${sweep} ${
      DISC_CX + r
    } ${DISC_CY} A ${r} ${r} 0 1 ${sweep} ${DISC_CX - r} ${DISC_CY} Z`
  return `${circle(outerRadius, 1)} ${circle(innerRadius, 0)}`
}

const discMirrorRing = discRing(DISC_MIRROR_RADIUS, DISC_CLAMP_RADIUS)
const discLeadInRing = discRing(DISC_DATA_INNER_RADIUS, DISC_MIRROR_RADIUS)

/** Bright recordable-disc silver (reference: light metallic, not charcoal). */
const DISC_BASE = "#e4e8ee"
const DISC_BRIGHT = "#f6f8fb"
const DISC_MID = "#d8dde6"
const DISC_EDGE = "#c6ccd6"

/**
 * Tray, disc, and plastic corner tabs beneath the booklet art. Drawn on a layer
 * below the cover image in `FramedArtwork`; the case margin exposes the tray.
 */
export default function JewelCaseUnderlay({ idPrefix = "jc", label }: Props) {
  const compact = useArtworkOverlayIsCompact()
  const tabId = `${idPrefix}-tab`
  const discLeftId = `${idPrefix}-disc-left`
  const discRightId = `${idPrefix}-disc-right`
  const discIridescentId = `${idPrefix}-disc-iridescent`
  const discMaskId = `${idPrefix}-disc-mask`
  const hubId = `${idPrefix}-hub`
  const labelPathId = `${idPrefix}-disc-label-path`
  const fittedLabel = label ? fitDiscLabel(label) : undefined
  const [labelFontReady, setLabelFontReady] = useState(!fittedLabel)

  useEffect(() => {
    if (!fittedLabel) {
      setLabelFontReady(true)
      return
    }
    let cancelled = false
    void loadDiscLabelFont(fittedLabel.fontSize).finally(() => {
      if (!cancelled) setLabelFontReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [fittedLabel?.fontSize, fittedLabel?.text])

  const tabArcs = [
    topTabArc(INSERT.x + TAB_OFFSET),
    topTabArc(INSERT_RIGHT - TAB_OFFSET),
    bottomTabArc(INSERT.x + TAB_OFFSET),
    bottomTabArc(INSERT_RIGHT - TAB_OFFSET),
  ]

  return (
    <OverlaySvg viewBox={`0 0 ${CASE.width} ${CASE.height}`}>
      <defs>
        {fittedLabel && <style>{discLabelFontStyles}</style>}
        <linearGradient id={tabId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient
          id={discLeftId}
          gradientUnits="userSpaceOnUse"
          x1={DISC_CX}
          y1={DISC_CY}
          x2={DISC_CX - DISC_RADIUS}
          y2={DISC_CY}
        >
          <stop offset="0%" stopColor={DISC_BRIGHT} stopOpacity="1" />
          <stop offset="45%" stopColor={DISC_MID} stopOpacity="0.92" />
          <stop offset="100%" stopColor={DISC_EDGE} stopOpacity="0.72" />
        </linearGradient>
        <linearGradient
          id={discRightId}
          gradientUnits="userSpaceOnUse"
          x1={DISC_CX}
          y1={DISC_CY}
          x2={DISC_CX + DISC_RADIUS}
          y2={DISC_CY}
        >
          <stop offset="0%" stopColor={DISC_BRIGHT} stopOpacity="1" />
          <stop offset="45%" stopColor={DISC_MID} stopOpacity="0.92" />
          <stop offset="100%" stopColor={DISC_EDGE} stopOpacity="0.72" />
        </linearGradient>
        {!compact && (
          <linearGradient
            id={discIridescentId}
            gradientUnits="userSpaceOnUse"
            x1={DISC_CX - DISC_RADIUS * 0.7}
            y1={DISC_CY - DISC_RADIUS * 0.7}
            x2={DISC_CX + DISC_RADIUS * 0.7}
            y2={DISC_CY + DISC_RADIUS * 0.7}
          >
            <stop offset="0%" stopColor="#f0f8d0" stopOpacity="0" />
            <stop offset="22%" stopColor="#eef6c8" stopOpacity="0.22" />
            <stop offset="45%" stopColor="#c8e8f0" stopOpacity="0.18" />
            <stop offset="72%" stopColor="#f0d0e0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f8e8f0" stopOpacity="0" />
          </linearGradient>
        )}
        <mask id={discMaskId} maskUnits="userSpaceOnUse">
          <circle cx={DISC_CX} cy={DISC_CY} r={DISC_RADIUS} fill="#fff" />
          <circle cx={DISC_CX} cy={DISC_CY} r={DISC_CLAMP_RADIUS} fill="#000" />
        </mask>
        <radialGradient id={hubId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#05060a" />
          <stop offset="60%" stopColor="#0b0e13" />
          <stop offset="100%" stopColor="#14181e" />
        </radialGradient>
        {fittedLabel && (
          <path
            id={labelPathId}
            d={`M ${DISC_CX - DISC_LABEL_PATH_RADIUS} ${DISC_CY} A ${DISC_LABEL_PATH_RADIUS} ${DISC_LABEL_PATH_RADIUS} 0 0 1 ${DISC_CX + DISC_LABEL_PATH_RADIUS} ${DISC_CY}`}
          />
        )}
      </defs>

      <rect
        x={FRONT_PANEL.x}
        y={FRONT_PANEL.y}
        width={FRONT_PANEL.width}
        height={FRONT_PANEL.height}
        fill={TRAY_BASE}
      />
      <rect
        x={FRONT_PANEL.x + 0.5}
        y={FRONT_PANEL.y + 0.5}
        width={FRONT_PANEL.width - 1}
        height={FRONT_PANEL.height - 1}
        fill="none"
        stroke={TRAY_EDGE}
        strokeOpacity="0.55"
        strokeWidth="0.6"
      />

      <g mask={`url(#${discMaskId})`}>
        <circle cx={DISC_CX} cy={DISC_CY} r={DISC_RADIUS} fill={DISC_BASE} />
        <path d={discTopSector} fill={DISC_MID} fillOpacity={0.88} />
        <path d={discBottomSector} fill={DISC_MID} fillOpacity={0.88} />
        <path d={discLeftSector} fill={`url(#${discLeftId})`} />
        <path d={discRightSector} fill={`url(#${discRightId})`} />
        {!compact && (
          <circle cx={DISC_CX} cy={DISC_CY} r={DISC_RADIUS} fill={`url(#${discIridescentId})`} />
        )}
        <path d={discLeadInRing} fill={DISC_BRIGHT} fillOpacity="0.55" />
        <path d={discMirrorRing} fill={DISC_BRIGHT} />
      </g>
      <circle
        cx={DISC_CX}
        cy={DISC_CY}
        r={DISC_RADIUS - DISC_RIM_WIDTH / 2}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.75"
        strokeWidth={DISC_RIM_WIDTH}
      />
      <circle
        cx={DISC_CX}
        cy={DISC_CY}
        r={DISC_DATA_INNER_RADIUS}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="0.35"
      />
      <circle
        cx={DISC_CX}
        cy={DISC_CY}
        r={DISC_CLAMP_RADIUS}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.45"
        strokeWidth="0.3"
      />

      {fittedLabel && labelFontReady && (
        <text className="disc-label-text" fill="#1a1f28" fontSize={fittedLabel.fontSize}>
          <textPath href={`#${labelPathId}`} startOffset="50%" textAnchor="middle">
            {fittedLabel.text}
          </textPath>
        </text>
      )}

      <circle cx={DISC_CX} cy={DISC_CY} r={HUB_OUTER} fill={`url(#${hubId})`} />
      {!compact &&
        hubTeeth.map(({ x1, y1, x2, y2 }, i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={HUB_TOOTH_COLOR}
            strokeWidth={HUB_TOOTH_WIDTH}
            strokeLinecap="round"
          />
        ))}
      <circle cx={DISC_CX} cy={DISC_CY} r={HUB_INNER} fill={HUB_SPINDLE_COLOR} />

      {tabArcs.map((d, i) => (
        <g key={i}>
          <path d={`${d} Z`} fill={`url(#${tabId})`} />
          <path
            d={d}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.9"
            strokeWidth={TAB_STROKE_WIDTH}
            strokeLinecap="round"
          />
        </g>
      ))}
    </OverlaySvg>
  )
}
