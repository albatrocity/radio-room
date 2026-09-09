/**
 * Analog VU meter for Now Playing artwork (ADR 0169).
 * Lazy-loaded only when the user owns item-shops:vu-meter in a radio room.
 * Shares the MSE analysis tap with Oscilloscope / Beat Detector; no MPEG backfill.
 * Reads envelope RMS hops (not PCM). Mounted over artwork at bottom-left (50% width).
 * Face colors use Chakra CSS vars so they track dynamic theme changes.
 */

import { useEffect, useRef, useState } from "react"
import { Box } from "@chakra-ui/react"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { useIsPlaying } from "../../hooks/useActors"
import {
  acquireAnalysisTap,
  fillEnvelopeAt,
  releaseAnalysisTap,
} from "../../lib/mse/analysisTap"
import {
  PRIMARY_CONTRAST_CSS_VAR,
  PRIMARY_SOLID_CSS_VAR,
} from "../../lib/oscilloscopeOwnership"
import {
  meanRms,
  rmsToVuDb,
  stepVuBallistics,
  vuToNeedleT,
  VU_MIN,
} from "../../lib/mse/vuBallistics"
import { getRadioMseElement } from "../../lib/mse/radioMseTransport"
import {
  radioStreamOscilloscopeSupported,
  subscribeRadioStreamPlayerStatus,
} from "../../actors/radioStreamActor"

const REDUCED_MOTION_INTERVAL_MS = 1000
/** ~90 ms of hops @ 44.1 kHz / 512 — short window keeps the needle snappy. */
const ENVELOPE_BUF_LEN = 8

/** SVG viewBox — wide/short analog face. */
const VB_W = 180
const VB_H = 72

/** Needle pivot and arc geometry in viewBox units. */
const PIVOT_X = 90
const PIVOT_Y = 68
const ARC_R = 56
/** Needle angles in degrees (0 = up); left rest → right overload. */
const ANGLE_MIN_DEG = -55
const ANGLE_MAX_DEG = 55

/** Theme-driven paints — resolve live from CSS so dynamic palette morphs apply. */
const SCALE_STROKE = `var(${PRIMARY_CONTRAST_CSS_VAR})`
const OVERLOAD_STROKE = "var(--chakra-colors-action-solid, #e85d4c)"
const FACE_BG = `color-mix(in srgb, var(${PRIMARY_SOLID_CSS_VAR}) 72%, black)`
const FACE_BORDER = `color-mix(in srgb, var(${PRIMARY_CONTRAST_CSS_VAR}) 28%, transparent)`

function needleAngleDeg(vu: number): number {
  const t = vuToNeedleT(vu)
  return ANGLE_MIN_DEG + t * (ANGLE_MAX_DEG - ANGLE_MIN_DEG)
}

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const start = polar(PIVOT_X, PIVOT_Y, r, fromDeg)
  const end = polar(PIVOT_X, PIVOT_Y, r, toDeg)
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  const sweep = toDeg > fromDeg ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`
}

/** Angle at 0 VU on the scale. */
const ZERO_VU_ANGLE = needleAngleDeg(0)

export default function VuMeter() {
  const needleRef = useRef<SVGLineElement>(null)
  const animationsEnabled = useAnimationsEnabled()
  const isPlaying = useIsPlaying()
  const [supported, setSupported] = useState(() => radioStreamOscilloscopeSupported())

  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const animationsEnabledRef = useRef(animationsEnabled)
  animationsEnabledRef.current = animationsEnabled
  const vuRef = useRef(VU_MIN)
  const lastTsRef = useRef(0)
  const envelopeBufRef = useRef(new Float32Array(ENVELOPE_BUF_LEN))

  useEffect(() => {
    return subscribeRadioStreamPlayerStatus(() => {
      setSupported(radioStreamOscilloscopeSupported())
    })
  }, [])

  useEffect(() => {
    if (!supported) return
    acquireAnalysisTap()
    return () => releaseAnalysisTap()
  }, [supported])

  useEffect(() => {
    if (!supported) return

    let disposed = false
    let rafId = 0
    let lastReducedDraw = 0

    const setNeedle = (vu: number) => {
      const needle = needleRef.current
      if (!needle) return
      const tip = polar(PIVOT_X, PIVOT_Y, ARC_R - 4, needleAngleDeg(vu))
      needle.setAttribute("x2", String(tip.x))
      needle.setAttribute("y2", String(tip.y))
    }

    setNeedle(vuRef.current)

    const tick = (now: number) => {
      if (disposed) return
      rafId = requestAnimationFrame(tick)

      const reduced = !animationsEnabledRef.current
      if (reduced) {
        if (now - lastReducedDraw < REDUCED_MOTION_INTERVAL_MS) return
        lastReducedDraw = now
      }

      const prevTs = lastTsRef.current
      lastTsRef.current = now
      const dtSec = prevTs > 0 ? Math.min(0.05, (now - prevTs) / 1000) : 1 / 60

      let target = VU_MIN
      if (!document.hidden && isPlayingRef.current) {
        const el = getRadioMseElement()
        if (el) {
          const buf = envelopeBufRef.current
          const n = fillEnvelopeAt(el.currentTime, buf)
          if (n > 0) {
            target = rmsToVuDb(meanRms(buf, n))
          }
        }
      }

      vuRef.current = stepVuBallistics(vuRef.current, target, dtSec)
      setNeedle(vuRef.current)
    }

    const onVisibilityChange = () => {
      if (document.hidden) return
      lastTsRef.current = 0
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(tick)
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    rafId = requestAnimationFrame(tick)

    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      cancelAnimationFrame(rafId)
    }
  }, [supported])

  if (!supported) return null

  const restTip = polar(PIVOT_X, PIVOT_Y, ARC_R - 4, needleAngleDeg(VU_MIN))

  return (
    <Box w="100%" position="relative" opacity={0.75} aria-hidden data-vu-meter="">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="auto"
        role="presentation"
        display="block"
      >
        <rect
          x={1}
          y={1}
          width={VB_W - 2}
          height={VB_H - 2}
          rx={6}
          fill={FACE_BG}
          stroke={FACE_BORDER}
          strokeWidth={1.5}
        />
        <path
          d={arcPath(ARC_R, ANGLE_MIN_DEG, ZERO_VU_ANGLE)}
          fill="none"
          stroke={SCALE_STROKE}
          strokeWidth={2}
          strokeOpacity={0.55}
        />
        <path
          d={arcPath(ARC_R, ZERO_VU_ANGLE, ANGLE_MAX_DEG)}
          fill="none"
          stroke={OVERLOAD_STROKE}
          strokeWidth={2.5}
          strokeOpacity={0.85}
        />
        {(() => {
          const a = polar(PIVOT_X, PIVOT_Y, ARC_R - 2, ZERO_VU_ANGLE)
          const b = polar(PIVOT_X, PIVOT_Y, ARC_R - 10, ZERO_VU_ANGLE)
          return (
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={OVERLOAD_STROKE}
              strokeWidth={1.5}
              strokeOpacity={0.9}
            />
          )
        })()}
        <text
          x={PIVOT_X}
          y={22}
          textAnchor="middle"
          fill={SCALE_STROKE}
          fillOpacity={0.7}
          fontSize={9}
          fontFamily="ui-monospace, monospace"
        >
          VU
        </text>
        <line
          ref={needleRef}
          x1={PIVOT_X}
          y1={PIVOT_Y}
          x2={restTip.x}
          y2={restTip.y}
          stroke={SCALE_STROKE}
          strokeWidth={1.75}
          strokeLinecap="round"
        />
        <circle
          cx={PIVOT_X}
          cy={PIVOT_Y}
          r={3.5}
          fill={SCALE_STROKE}
          fillOpacity={0.85}
        />
      </svg>
    </Box>
  )
}
