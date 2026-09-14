/**
 * Chromatic Tuner readout for Now Playing info (ADR 0171).
 * Lazy-loaded only when the user owns item-shops:chromatic-tuner in a radio room.
 * Shares the MSE analysis tap with Oscilloscope / Beat Detector / VU Meter; no MPEG backfill.
 * Key via module Worker + @audio/mir-chroma / @audio/mir-key — MIR packages are never
 * statically imported here so non-owners do not download them.
 * Resets the analysis epoch on each now-playing track change so key is not mixed across songs.
 */

import { useEffect, useRef, useState } from "react"
import { Box, HStack, Icon, IconButton, Spinner, Text } from "@chakra-ui/react"
import { queueItemStableKey } from "@repo/types"
import { useIsPlaying, useNowPlaying } from "../../hooks/useActors"
import {
  acquireAnalysisTap,
  fillPcmAt,
  getAnalysisSampleRate,
  getAnalysisWriteEnd,
  releaseAnalysisTap,
} from "../../lib/mse/analysisTap"
import { applyKeyHysteresis, type DetectedKey } from "../../lib/mse/keyDetectionTypes"
import {
  createKeyDetectionWorker,
  type KeyDetectionWorkerHandle,
} from "../../lib/mse/keyDetectionClient"
import { getRadioMseElement } from "../../lib/mse/radioMseTransport"
import {
  radioStreamOscilloscopeSupported,
  subscribeRadioStreamPlayerStatus,
} from "../../actors/radioStreamActor"
import { getIcon } from "../PluginComponents/icons"
import { Tooltip } from "../ui/tooltip"

const ANALYZE_MS = 3000
/** Analysis window — longer = stabler key, capped by PCM ring (~30 s). */
const WINDOW_SEC = 8
/** First lock can use a shorter window so the spinner resolves sooner. */
const MIN_ANALYZE_SEC = 4

const TunerIcon = getIcon("Music2")
const RetryIcon = getIcon("RefreshCw")

export default function ChromaticTuner() {
  const isPlaying = useIsPlaying()
  const nowPlaying = useNowPlaying()
  const trackKey = nowPlaying ? queueItemStableKey(nowPlaying) : ""
  const [supported, setSupported] = useState(() => radioStreamOscilloscopeSupported())
  const [keyLabel, setKeyLabel] = useState<string | null>(null)
  const [camelot, setCamelot] = useState<string | null>(null)

  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const lockedRef = useRef<DetectedKey | null>(null)
  const lastAnalyzeAtRef = useRef(0)
  const analyzeBusyRef = useRef(false)
  const pcmBufRef = useRef<Float32Array | null>(null)
  /** Absolute PCM sample index; analysis ignores audio before this (per-track epoch). */
  const pcmEpochRef = useRef(0)
  const trackKeyRef = useRef(trackKey)
  const forceRetryRef = useRef(false)
  const workerRef = useRef<KeyDetectionWorkerHandle | null>(null)
  const requestGenRef = useRef(0)

  useEffect(() => {
    return subscribeRadioStreamPlayerStatus(() => {
      setSupported(radioStreamOscilloscopeSupported())
    })
  }, [])

  useEffect(() => {
    if (!supported) return
    acquireAnalysisTap()
    pcmEpochRef.current = getAnalysisWriteEnd()
    const worker = createKeyDetectionWorker()
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
      releaseAnalysisTap()
    }
  }, [supported])

  useEffect(() => {
    if (trackKey === trackKeyRef.current) return
    trackKeyRef.current = trackKey
    // New now-playing identity: drop prior lock and only use PCM from this point on.
    lockedRef.current = null
    lastAnalyzeAtRef.current = 0
    analyzeBusyRef.current = false
    requestGenRef.current += 1
    pcmEpochRef.current = getAnalysisWriteEnd()
    setKeyLabel(null)
    setCamelot(null)
  }, [trackKey])

  useEffect(() => {
    if (!supported) return

    let disposed = false
    let rafId = 0

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
      const worker = workerRef.current
      if (!worker) return
      const rate = getAnalysisSampleRate()
      if (rate <= 0) return

      const need = Math.ceil(WINDOW_SEC * rate)
      const minNeed = Math.ceil(MIN_ANALYZE_SEC * rate)
      const buf = ensurePcmBuf(rate)
      const epoch = pcmEpochRef.current
      const n = fillPcmAt(currentTime, buf, epoch)
      // Prefer a full window; allow a shorter first lock once we have enough PCM.
      if (n < minNeed) return
      const useCount = n >= need ? need : n

      analyzeBusyRef.current = true
      // Dedicated copy for transfer — never transfer the fill buffer / ring.
      const snapshot = buf.slice(0, useCount)
      const epochAtStart = epoch
      const trackAtStart = trackKeyRef.current
      const genAtStart = requestGenRef.current

      void worker
        .analyze(snapshot, rate)
        .then((raw) => {
          if (disposed) return
          // Drop stale results if the track changed mid-analysis.
          if (
            trackKeyRef.current !== trackAtStart ||
            pcmEpochRef.current !== epochAtStart ||
            requestGenRef.current !== genAtStart
          ) {
            return
          }
          const locked = applyKeyHysteresis(lockedRef.current, raw)
          lockedRef.current = locked
          if (locked) {
            setKeyLabel(locked.displayLabel)
            setCamelot(locked.camelot)
          }
        })
        .finally(() => {
          analyzeBusyRef.current = false
        })
    }

    const tick = (now: number) => {
      if (disposed) return
      rafId = requestAnimationFrame(tick)

      if (document.hidden || !isPlayingRef.current) return

      const el = getRadioMseElement()
      if (!el) return

      if (forceRetryRef.current || now - lastAnalyzeAtRef.current >= ANALYZE_MS) {
        forceRetryRef.current = false
        lastAnalyzeAtRef.current = now
        runAnalyze(el.currentTime)
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
    }
  }, [supported])

  const requestRetry = () => {
    lockedRef.current = null
    lastAnalyzeAtRef.current = 0
    analyzeBusyRef.current = false
    forceRetryRef.current = true
    requestGenRef.current += 1
    setKeyLabel(null)
    setCamelot(null)
  }

  const detecting = supported && isPlaying && keyLabel == null
  const keyAria = !supported
    ? "Key unavailable"
    : detecting
      ? "Detecting key"
      : keyLabel == null
        ? "Key unavailable"
        : `Approximately ${keyLabel}`

  const tooltip =
    keyLabel != null && camelot != null
      ? `From Chromatic Tuner · ${camelot}`
      : "From Chromatic Tuner"

  return (
    <HStack
      gap={2}
      colorPalette="primary"
      align="center"
      data-plugin-component-id="chromatic-tuner"
      aria-label={keyAria}
      aria-busy={detecting || undefined}
    >
      <Tooltip content={tooltip} showArrow openDelay={300}>
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
          ) : TunerIcon ? (
            <Icon as={TunerIcon} boxSize={3} />
          ) : null}
        </Box>
      </Tooltip>
      {detecting ? (
        <Text fontSize="xs" color="primary.contrast">
          Detecting key...
        </Text>
      ) : (
        <>
          <Text
            fontSize="xs"
            fontFamily="mono"
            fontVariantNumeric="tabular-nums"
            color="primary.contrast"
          >
            {keyLabel == null ? "—" : keyLabel}
          </Text>
          {keyLabel != null && RetryIcon ? (
            <Tooltip content="Re-detect key" showArrow openDelay={300}>
              <IconButton
                aria-label="Re-detect key"
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
