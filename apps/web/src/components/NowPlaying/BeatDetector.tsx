/**
 * Beat Detector readout for Now Playing info (ADR 0168).
 * Lazy-loaded only when the user owns item-shops:beat-detector in a radio room.
 * Shares the MSE analysis tap with Oscilloscope; no MPEG backfill.
 * Tempo via realtime-bpm-analyzer `analyzeFullBuffer` on float PCM — no element routing.
 * Resets the analysis epoch on each now-playing track change so tempo is not mixed across songs.
 */

import { useEffect, useRef, useState } from "react"
import { Box, HStack, Icon, IconButton, Spinner, Text } from "@chakra-ui/react"
import { queueItemStableKey } from "@repo/types"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { useIsPlaying, useNowPlaying } from "../../hooks/useActors"
import {
  acquireAnalysisTap,
  fillPcmAt,
  getAnalysisSampleRate,
  getAnalysisWriteEnd,
  releaseAnalysisTap,
} from "../../lib/mse/analysisTap"
import {
  beatIndexAt,
  lockBeatClockFromPcm,
  preloadBeatDetectionLibrary,
  type LockedBeatClock,
} from "../../lib/mse/beatClockFromPcm"
import { getRadioMseElement } from "../../lib/mse/radioMseTransport"
import {
  radioStreamOscilloscopeSupported,
  subscribeRadioStreamPlayerStatus,
} from "../../actors/radioStreamActor"
import { getIcon } from "../PluginComponents/icons"
import { Tooltip } from "../ui/tooltip"

const ANALYZE_MS = 3000
const PULSE_MS = 120
/** Cap static ticks when reduced motion is on. */
const REDUCED_MOTION_TICK_MS = 1000
/** Analysis window — longer = stabler tempo, capped by PCM ring (~30 s). */
const WINDOW_SEC = 12

const BeatDetectorIcon = getIcon("Radar")
const RetryIcon = getIcon("RefreshCw")

export default function BeatDetector() {
  const animationsEnabled = useAnimationsEnabled()
  const isPlaying = useIsPlaying()
  const nowPlaying = useNowPlaying()
  const trackKey = nowPlaying ? queueItemStableKey(nowPlaying) : ""
  const [supported, setSupported] = useState(() => radioStreamOscilloscopeSupported())
  const [bpmLabel, setBpmLabel] = useState<string | null>(null)
  const [pulsing, setPulsing] = useState(false)

  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const animationsEnabledRef = useRef(animationsEnabled)
  animationsEnabledRef.current = animationsEnabled
  const clockRef = useRef<LockedBeatClock | null>(null)
  const lastBeatIndexRef = useRef<number | null>(null)
  const lastAnalyzeAtRef = useRef(0)
  const analyzeBusyRef = useRef(false)
  const lastReducedTickRef = useRef(0)
  const pulseClearRef = useRef<number | null>(null)
  const pcmBufRef = useRef<Float32Array | null>(null)
  /** Absolute PCM sample index; analysis ignores audio before this (per-track epoch). */
  const pcmEpochRef = useRef(0)
  const trackKeyRef = useRef(trackKey)
  const forceRetryRef = useRef(false)

  useEffect(() => {
    // Component only mounts for inventory owners (NowPlayingTrack gate).
    preloadBeatDetectionLibrary()
  }, [])

  useEffect(() => {
    return subscribeRadioStreamPlayerStatus(() => {
      setSupported(radioStreamOscilloscopeSupported())
    })
  }, [])

  useEffect(() => {
    if (!supported) return
    acquireAnalysisTap()
    pcmEpochRef.current = getAnalysisWriteEnd()
    return () => releaseAnalysisTap()
  }, [supported])

  useEffect(() => {
    if (trackKey === trackKeyRef.current) return
    trackKeyRef.current = trackKey
    // New now-playing identity: drop prior lock and only use PCM from this point on.
    clockRef.current = null
    lastBeatIndexRef.current = null
    lastAnalyzeAtRef.current = 0
    analyzeBusyRef.current = false
    pcmEpochRef.current = getAnalysisWriteEnd()
    setBpmLabel(null)
    setPulsing(false)
  }, [trackKey])

  useEffect(() => {
    if (!supported) return

    let disposed = false
    let rafId = 0

    const clearPulseTimer = () => {
      if (pulseClearRef.current != null) {
        window.clearTimeout(pulseClearRef.current)
        pulseClearRef.current = null
      }
    }

    const triggerPulse = (now: number) => {
      if (!animationsEnabledRef.current) {
        if (now - lastReducedTickRef.current < REDUCED_MOTION_TICK_MS) return
        lastReducedTickRef.current = now
        setPulsing(true)
        clearPulseTimer()
        pulseClearRef.current = window.setTimeout(() => {
          if (!disposed) setPulsing(false)
        }, PULSE_MS)
        return
      }
      setPulsing(true)
      clearPulseTimer()
      pulseClearRef.current = window.setTimeout(() => {
        if (!disposed) setPulsing(false)
      }, PULSE_MS)
    }

    const ensurePcmBuf = (rate: number): Float32Array => {
      const need = Math.ceil(WINDOW_SEC * rate)
      let buf = pcmBufRef.current
      if (!buf || buf.length !== need) {
        buf = new Float32Array(need)
        pcmBufRef.current = buf
      }
      return buf
    }

    const runAnalyze = (currentTime: number) => {
      if (analyzeBusyRef.current || disposed) return
      const rate = getAnalysisSampleRate()
      if (rate <= 0) return

      const need = Math.ceil(WINDOW_SEC * rate)
      const buf = ensurePcmBuf(rate)
      const epoch = pcmEpochRef.current
      const n = fillPcmAt(currentTime, buf, epoch)
      // Wait for a full post-epoch analysis window before locking.
      if (n < need) return

      analyzeBusyRef.current = true
      const snapshot = buf.slice(0, n)
      const windowEnd = currentTime
      const prev = clockRef.current
      const epochAtStart = epoch
      const trackAtStart = trackKeyRef.current

      void (async () => {
        try {
          if (disposed) return
          const locked = await lockBeatClockFromPcm(
            snapshot,
            rate,
            windowEnd,
            prev?.bpm ?? null,
            prev?.phaseSec ?? null,
          )
          if (!locked || disposed) return
          // Drop stale results if the track changed mid-analysis.
          if (trackKeyRef.current !== trackAtStart || pcmEpochRef.current !== epochAtStart) {
            return
          }
          clockRef.current = locked
          setBpmLabel(String(locked.bpm))
          const el = getRadioMseElement()
          if (el) {
            lastBeatIndexRef.current = beatIndexAt(locked, el.currentTime)
          }
        } finally {
          analyzeBusyRef.current = false
        }
      })()
    }

    const tick = (now: number) => {
      if (disposed) return
      rafId = requestAnimationFrame(tick)

      if (document.hidden || !isPlayingRef.current) return

      const el = getRadioMseElement()
      if (!el) return

      const t = el.currentTime
      const clock = clockRef.current
      if (clock) {
        const idx = beatIndexAt(clock, t)
        const prevIdx = lastBeatIndexRef.current
        if (prevIdx != null && idx > prevIdx) {
          triggerPulse(now)
        }
        lastBeatIndexRef.current = idx
      }

      if (forceRetryRef.current || now - lastAnalyzeAtRef.current >= ANALYZE_MS) {
        forceRetryRef.current = false
        lastAnalyzeAtRef.current = now
        runAnalyze(t)
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) return
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(tick)
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    rafId = requestAnimationFrame(tick)

    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      cancelAnimationFrame(rafId)
      clearPulseTimer()
    }
  }, [supported])

  const requestRetry = () => {
    clockRef.current = null
    lastBeatIndexRef.current = null
    lastAnalyzeAtRef.current = 0
    analyzeBusyRef.current = false
    forceRetryRef.current = true
    setBpmLabel(null)
    setPulsing(false)
  }

  const detecting = supported && isPlaying && bpmLabel == null
  const bpmAria = !supported
    ? "BPM unavailable"
    : detecting
      ? "Detecting BPM"
      : bpmLabel == null
        ? "BPM unavailable"
        : `Approximately ${bpmLabel} BPM`

  return (
    <HStack
      gap={2}
      colorPalette="primary"
      align="center"
      data-plugin-component-id="beat-detector"
      aria-label={bpmAria}
      aria-busy={detecting || undefined}
    >
      <Tooltip content="From Beat Detector" showArrow openDelay={300}>
        <Box
          as="span"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          w={3}
          h={3}
          color="primary.contrast"
          aria-hidden
        >
          {detecting ? (
            <Spinner size="xs" color="primary.contrast" opacity={0.45} />
          ) : BeatDetectorIcon ? (
            <Icon as={BeatDetectorIcon} boxSize={3} />
          ) : null}
        </Box>
      </Tooltip>
      {detecting ? (
        <Text fontSize="xs" color="primary.contrast">
          Detecting BPM...
        </Text>
      ) : (
        <>
          <Box
            w={2}
            h={2}
            borderRadius="full"
            flexShrink={0}
            bg={pulsing ? "action.solid" : "primary.contrast"}
            transition={
              animationsEnabled
                ? `background-color ${PULSE_MS}ms ease-out`
                : undefined
            }
            aria-hidden
          />
          <Text
            fontSize="xs"
            fontFamily="mono"
            fontVariantNumeric="tabular-nums"
            color="primary.contrast"
          >
            {bpmLabel == null ? "—" : `${bpmLabel} BPM`}
          </Text>
          {bpmLabel != null && RetryIcon ? (
            <Tooltip content="Re-detect BPM" showArrow openDelay={300}>
              <IconButton
                aria-label="Re-detect BPM"
                size="xs"
                variant="ghost"
                color="primary.contrast"
                opacity={0.7}
                minW="unset"
                h={4}
                w={4}
                onClick={requestRetry}
              >
                <Icon as={RetryIcon} boxSize={2.5} />
              </IconButton>
            </Tooltip>
          ) : null}
        </>
      )}
    </HStack>
  )
}
