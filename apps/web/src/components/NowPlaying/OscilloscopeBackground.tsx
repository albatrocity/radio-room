/**
 * CRT-style oscilloscope behind Now Playing (ADR 0136 / MSE Phase 2).
 * Lazy-loaded only when the user owns item-shops:oscilloscope in a radio room.
 */

import { useEffect, useRef, useState } from "react"
import { Box, Text } from "@chakra-ui/react"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { useIsPlaying } from "../../hooks/useActors"
import {
  fillRadioTimeDomainData,
  getRadioAudioTapDebugSnapshot,
  type RadioAudioTapDebugSnapshot,
} from "../../lib/radioAudioTap"
import { startAnalysisTap, stopAnalysisTap } from "../../lib/mse/analysisTap"
import { backfillRadioMseAnalysisTap } from "../../lib/mse/radioMseTransport"
import {
  getRadioStreamPlayerDebug,
  getRadioStreamPlayerStatus,
  radioStreamOscilloscopeSupported,
  subscribeRadioStreamPlayerStatus,
} from "../../actors/radioStreamActor"
import {
  PRIMARY_CONTRAST_CSS_VAR,
  PRIMARY_SOLID_CSS_VAR,
} from "../../lib/oscilloscopeOwnership"

const TRACE_SAMPLES = 2048
const MAJOR_X = 10
const MAJOR_Y = 8
const MINOR_TICKS_PER_DIV = 5
const REDUCED_MOTION_INTERVAL_MS = 1000
/** TEMP debug HUD — leave false; console logging + status churn tanks Safari. */
const OSCILLOSCOPE_TEMP_DEBUG = false
const DEBUG_LOG_INTERVAL_MS = 2000
/** Chakra default `sm` — column layout puts artwork above metadata. */
const DESKTOP_LAYOUT_MQ = "(min-width: 30em)"
const ARTWORK_ANCHOR = "[data-now-playing-artwork]"

function formatDebugHud(s: RadioAudioTapDebugSnapshot): string {
  const stream = getRadioStreamPlayerStatus()
  const d = getRadioStreamPlayerDebug()
  return [
    "TEMP oscope debug",
    `safari=${s.safariLike} tap=${s.tapActive} buf=${s.tapBufferedSec.toFixed(2)}s`,
    `stream state=${d.state} transport=${d.transport} err=${d.error ?? "null"}`,
    `playingDesired=${d.playingDesired}`,
    `el paused=${d.paused ?? "—"} ready=${d.readyState ?? "—"} ct=${d.currentTime?.toFixed(2) ?? "—"}`,
    `mse frames=${d.framesAppended} appended=${d.appendedSec.toFixed(2)}s`,
  ].join("\n")
}

function readThemeColors(el: HTMLElement): { solid: string; contrast: string } {
  const styles = getComputedStyle(el)
  const solid = styles.getPropertyValue(PRIMARY_SOLID_CSS_VAR).trim() || "#0d7377"
  const contrast = styles.getPropertyValue(PRIMARY_CONTRAST_CSS_VAR).trim() || "#e8fff0"
  return { solid, contrast }
}

function mixContrastOnSolid(solid: string, contrast: string, amount: number): string {
  return `color-mix(in srgb, ${contrast} ${Math.round(amount * 100)}%, ${solid})`
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridColor: string,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1

  const cellW = width / MAJOR_X
  const cellH = height / MAJOR_Y

  ctx.beginPath()
  for (let i = 0; i <= MAJOR_X; i++) {
    const x = Math.round(i * cellW) + 0.5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let j = 0; j <= MAJOR_Y; j++) {
    const y = Math.round(j * cellH) + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()

  const midX = Math.round(width / 2) + 0.5
  const midY = Math.round(height / 2) + 0.5
  const tickLen = Math.max(3, Math.min(cellW, cellH) * 0.12)

  ctx.beginPath()
  for (let i = 0; i < MAJOR_X; i++) {
    for (let t = 1; t < MINOR_TICKS_PER_DIV; t++) {
      const x = Math.round(i * cellW + (t * cellW) / MINOR_TICKS_PER_DIV) + 0.5
      ctx.moveTo(x, midY - tickLen)
      ctx.lineTo(x, midY + tickLen)
    }
  }
  for (let j = 0; j < MAJOR_Y; j++) {
    for (let t = 1; t < MINOR_TICKS_PER_DIV; t++) {
      const y = Math.round(j * cellH + (t * cellH) / MINOR_TICKS_PER_DIV) + 0.5
      ctx.moveTo(midX - tickLen, y)
      ctx.lineTo(midX + tickLen, y)
    }
  }
  ctx.stroke()
}

function drawTrace(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
  contrast: string,
  solid: string,
  trail: boolean,
): void {
  if (trail) {
    ctx.fillStyle = solid
    ctx.globalAlpha = 0.2
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  } else {
    ctx.clearRect(0, 0, width, height)
  }

  const slice = width / Math.max(1, data.length - 1)
  const stroke = mixContrastOnSolid(solid, contrast, 0.55)

  ctx.beginPath()
  ctx.strokeStyle = stroke
  ctx.globalAlpha = 0.14
  ctx.lineWidth = 3
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  for (let i = 0; i < data.length; i++) {
    const x = i * slice
    const v = data[i]! / 255
    const y = (1 - v) * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  ctx.beginPath()
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1.25
  for (let i = 0; i < data.length; i++) {
    const x = i * slice
    const v = data[i]! / 255
    const y = (1 - v) * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}

export default function OscilloscopeBackground() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphAreaRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLCanvasElement>(null)
  const traceRef = useRef<HTMLCanvasElement>(null)
  const animationsEnabled = useAnimationsEnabled()
  const isPlaying = useIsPlaying()
  const [debugHud, setDebugHud] = useState("")
  const [supported, setSupported] = useState(radioStreamOscilloscopeSupported)
  /** Desktop: offset below artwork so the graph isn't under the cover. */
  const [desktopTopPx, setDesktopTopPx] = useState(0)

  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const animationsEnabledRef = useRef(animationsEnabled)
  animationsEnabledRef.current = animationsEnabled

  useEffect(() => {
    return subscribeRadioStreamPlayerStatus(() => {
      setSupported(radioStreamOscilloscopeSupported())
    })
  }, [])

  useEffect(() => {
    if (!supported) return
    startAnalysisTap()
    backfillRadioMseAnalysisTap()
    return () => stopAnalysisTap()
  }, [supported])

  useEffect(() => {
    const host = containerRef.current?.parentElement
    if (!host) return

    const mq = window.matchMedia(DESKTOP_LAYOUT_MQ)
    let artRo: ResizeObserver | null = null
    let observedArt: Element | null = null

    const updateTop = () => {
      if (!mq.matches) {
        setDesktopTopPx(0)
        return
      }
      const art = host.querySelector(ARTWORK_ANCHOR)
      if (!(art instanceof HTMLElement)) {
        setDesktopTopPx(0)
        return
      }
      const hostRect = host.getBoundingClientRect()
      const artRect = art.getBoundingClientRect()
      setDesktopTopPx(Math.max(0, Math.round(artRect.bottom - hostRect.top)))
    }

    const bindArtObserver = () => {
      const art = host.querySelector(ARTWORK_ANCHOR)
      if (art === observedArt) return
      artRo?.disconnect()
      observedArt = art
      if (art) {
        artRo = new ResizeObserver(updateTop)
        artRo.observe(art)
      }
    }

    const onDomChange = () => {
      bindArtObserver()
      updateTop()
    }

    const hostRo = new ResizeObserver(onDomChange)
    hostRo.observe(host)
    const mo = new MutationObserver(onDomChange)
    mo.observe(host, { childList: true, subtree: true })
    host.addEventListener("scroll", updateTop, true)
    mq.addEventListener("change", updateTop)
    onDomChange()

    return () => {
      hostRo.disconnect()
      artRo?.disconnect()
      mo.disconnect()
      host.removeEventListener("scroll", updateTop, true)
      mq.removeEventListener("change", updateTop)
    }
  }, [])

  useEffect(() => {
    if (!OSCILLOSCOPE_TEMP_DEBUG) return
    const refresh = () => {
      setDebugHud(formatDebugHud(getRadioAudioTapDebugSnapshot()))
    }
    const id = window.setInterval(refresh, DEBUG_LOG_INTERVAL_MS)
    refresh()
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!supported) return

    const graphArea = graphAreaRef.current
    const gridCanvas = gridRef.current
    const traceCanvas = traceRef.current
    if (!graphArea || !gridCanvas || !traceCanvas) return

    const gridCtx = gridCanvas.getContext("2d")
    const traceCtx = traceCanvas.getContext("2d")
    if (!gridCtx || !traceCtx) return

    let disposed = false
    let rafId = 0
    let lastReducedDraw = 0
    const timeData = new Uint8Array(TRACE_SAMPLES) as Uint8Array<ArrayBuffer>
    let cssW = 0
    let cssH = 0

    const resize = () => {
      const rect = graphArea.getBoundingClientRect()
      cssW = Math.max(1, Math.floor(rect.width))
      cssH = Math.max(1, Math.floor(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      for (const canvas of [gridCanvas, traceCanvas]) {
        canvas.width = Math.floor(cssW * dpr)
        canvas.height = Math.floor(cssH * dpr)
        canvas.style.width = `${cssW}px`
        canvas.style.height = `${cssH}px`
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
      }
      const { solid, contrast } = readThemeColors(graphArea)
      drawGraticule(gridCtx, cssW, cssH, mixContrastOnSolid(solid, contrast, 0.15))
    }

    const ro = new ResizeObserver(() => resize())
    ro.observe(graphArea)
    resize()

    const tick = (now: number) => {
      if (disposed) return
      rafId = requestAnimationFrame(tick)

      const reduced = !animationsEnabledRef.current
      if (reduced) {
        if (now - lastReducedDraw < REDUCED_MOTION_INTERVAL_MS) return
        lastReducedDraw = now
      }

      if (document.hidden || !isPlayingRef.current) return

      if (!fillRadioTimeDomainData(timeData)) return

      const { solid, contrast } = readThemeColors(graphArea)
      drawTrace(traceCtx, timeData, cssW, cssH, contrast, solid, !reduced)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [desktopTopPx, supported])

  if (!supported) return null

  return (
    <Box
      ref={containerRef}
      position="absolute"
      inset={0}
      pointerEvents="none"
      overflow="hidden"
      zIndex={OSCILLOSCOPE_TEMP_DEBUG ? 40 : 0}
      aria-hidden={!OSCILLOSCOPE_TEMP_DEBUG}
    >
      <Box
        ref={graphAreaRef}
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        top={`${desktopTopPx}px`}
        overflow="hidden"
      >
        <canvas
          ref={traceRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        <canvas
          ref={gridRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </Box>
      <Box
        position="absolute"
        inset={0}
        pointerEvents="none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, color-mix(in srgb, black 35%, transparent) 100%)",
        }}
      />
      {OSCILLOSCOPE_TEMP_DEBUG && debugHud && (
        <Text
          position="absolute"
          left={2}
          bottom={2}
          zIndex={1}
          fontSize="10px"
          lineHeight="1.25"
          fontFamily="mono"
          color="white"
          bg="blackAlpha.800"
          px={2}
          py={1}
          whiteSpace="pre-wrap"
          maxW="95%"
          pointerEvents="auto"
          userSelect="text"
          cursor="text"
        >
          {debugHud}
        </Text>
      )}
    </Box>
  )
}
