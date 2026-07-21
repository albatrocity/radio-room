import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMachine } from "@xstate/react"
import { Box, HStack, Slider, Text, VStack } from "@chakra-ui/react"
import { LuVolume2 } from "react-icons/lu"

import { emitToSocket } from "../../actors/socketActor"
import { useIsAdmin, useIsRoomCreator } from "../../hooks/useActors"
import socket from "../../lib/socket"
import { toast } from "../../lib/toasts"
import { createSliderMachine } from "../../machines/sliderMachine"
import { SvgIcon } from "../ui/svg-icon"
import { Tooltip } from "../ui/tooltip"
import type { Room } from "../../types/Room"

type PlaybackTransportState = "playing" | "paused" | "stopped"

interface PlaybackStatePayload {
  state?: PlaybackTransportState
  progressMs?: number | null
  durationMs?: number | null
  volumePercent?: number | null
  supportsVolume?: boolean
  canResume?: boolean
  message?: string
  positionMs?: number
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

interface NowPlayingTransportProps {
  room: Partial<Room> | null
}

/**
 * Admin-only seek scrubber + broadcast volume for app-controlled rooms (ADR 0078).
 */
export function NowPlayingTransport({ room }: NowPlayingTransportProps) {
  const isAdmin = useIsAdmin()
  const isRoomCreator = useIsRoomCreator()
  const canControl =
    room?.playbackMode === "app-controlled" && (isAdmin || isRoomCreator)

  if (!canControl) return null

  return <NowPlayingTransportInner />
}

/** Snap only when server and local estimates diverge by more than this. */
const PROGRESS_SNAP_DRIFT_MS = 2000

function NowPlayingTransportInner() {
  const [playbackState, setPlaybackState] = useState<PlaybackTransportState | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [volumePercent, setVolumePercent] = useState(100)
  const [supportsVolume, setSupportsVolume] = useState(false)
  const [displayProgressMs, setDisplayProgressMs] = useState(0)
  const [isSeekDragging, setIsSeekDragging] = useState(false)
  const [hasProgress, setHasProgress] = useState(false)

  const progressAnchorRef = useRef<{ progressMs: number; atMs: number } | null>(null)
  const isSeekDraggingRef = useRef(false)
  const playbackStateRef = useRef<PlaybackTransportState | null>(null)
  const durationMsRef = useRef<number | null>(null)
  const displayProgressRef = useRef(0)

  const setDisplayProgress = useCallback((ms: number) => {
    displayProgressRef.current = ms
    setDisplayProgressMs(ms)
  }, [])

  /**
   * Reconcile a server progress sample with the local clock.
   * While playing, keep interpolating smoothly and only snap on large drift
   * (seek, track change). Small lag from cache/network must not yank the bar.
   */
  const reconcileServerProgress = useCallback(
    (serverProgress: number, nextState?: PlaybackTransportState | null) => {
      const now = Date.now()
      const playing = (nextState ?? playbackStateRef.current) === "playing"
      const duration = durationMsRef.current
      const clampedServer =
        duration != null && duration > 0
          ? Math.min(serverProgress, duration)
          : Math.max(0, serverProgress)

      if (!playing) {
        progressAnchorRef.current = { progressMs: clampedServer, atMs: now }
        setDisplayProgress(clampedServer)
        setHasProgress(true)
        return
      }

      const anchor = progressAnchorRef.current
      if (!anchor) {
        progressAnchorRef.current = { progressMs: clampedServer, atMs: now }
        setDisplayProgress(clampedServer)
        setHasProgress(true)
        return
      }

      const localEstimate = anchor.progressMs + (now - anchor.atMs)
      const drift = clampedServer - localEstimate

      // Track restart / large external seek: hard snap
      const looksLikeTrackRestart = clampedServer < 1500 && localEstimate > 8000
      if (Math.abs(drift) > PROGRESS_SNAP_DRIFT_MS || looksLikeTrackRestart) {
        progressAnchorRef.current = { progressMs: clampedServer, atMs: now }
        setDisplayProgress(clampedServer)
        setHasProgress(true)
        return
      }

      // Stay on the smooth local clock; re-base so the next ticks continue from here
      progressAnchorRef.current = { progressMs: localEstimate, atMs: now }
      setHasProgress(true)
    },
    [setDisplayProgress],
  )

  const applyPlaybackState = useCallback(
    (data: PlaybackStatePayload) => {
      if (data.state) {
        playbackStateRef.current = data.state
        setPlaybackState(data.state)
      }
      if (typeof data.durationMs === "number") {
        durationMsRef.current = data.durationMs
        setDurationMs(data.durationMs)
      } else if (data.durationMs === null) {
        durationMsRef.current = null
        setDurationMs(null)
      }

      if (typeof data.progressMs === "number") {
        if (!isSeekDraggingRef.current) {
          reconcileServerProgress(data.progressMs, data.state)
        }
      } else if (data.progressMs === null) {
        if (!isSeekDraggingRef.current) {
          progressAnchorRef.current = null
          setDisplayProgress(0)
          setHasProgress(false)
        }
      }

      if (typeof data.volumePercent === "number") {
        setVolumePercent(data.volumePercent)
      }
      if (typeof data.supportsVolume === "boolean") {
        setSupportsVolume(data.supportsVolume)
      }
    },
    [reconcileServerProgress, setDisplayProgress],
  )

  useEffect(() => {
    const onEvent = (payload: { type?: string; data?: PlaybackStatePayload }) => {
      if (payload.type === "PLAYBACK_STATE" && payload.data) {
        applyPlaybackState(payload.data)
      }
      if (payload.type === "GET_PLAYBACK_STATE_FAILURE") {
        playbackStateRef.current = null
        setPlaybackState(null)
        durationMsRef.current = null
        setDurationMs(null)
        setSupportsVolume(false)
        setHasProgress(false)
        progressAnchorRef.current = null
      }
      if (payload.type === "SEEK_PLAYBACK_SUCCESS" && typeof payload.data?.positionMs === "number") {
        const pos = payload.data.positionMs
        const now = Date.now()
        progressAnchorRef.current = { progressMs: pos, atMs: now }
        if (!isSeekDraggingRef.current) {
          setDisplayProgress(pos)
          setHasProgress(true)
        }
      }
      if (payload.type === "SEEK_PLAYBACK_FAILURE") {
        toast({
          title: "Couldn't seek",
          description: payload.data?.message,
          type: "error",
          duration: 4000,
        })
        emitToSocket("GET_PLAYBACK_STATE", {})
      }
      if (
        payload.type === "SET_PLAYBACK_VOLUME_SUCCESS" &&
        typeof payload.data?.volumePercent === "number"
      ) {
        setVolumePercent(payload.data.volumePercent)
      }
      if (payload.type === "SET_PLAYBACK_VOLUME_FAILURE") {
        toast({
          title: "Couldn't set volume",
          description: payload.data?.message,
          type: "error",
          duration: 4000,
        })
        emitToSocket("GET_PLAYBACK_STATE", {})
      }
      if (payload.type === "PLAYBACK_STATE_CHANGED" && payload.data?.state) {
        playbackStateRef.current = payload.data.state
        setPlaybackState(payload.data.state)
        emitToSocket("GET_PLAYBACK_STATE", {})
      }
    }

    socket.on("event", onEvent)
    emitToSocket("GET_PLAYBACK_STATE", {})
    // Progress is interpolated locally while playing; poll only to re-anchor.
    const pollId = window.setInterval(() => {
      emitToSocket("GET_PLAYBACK_STATE", {})
    }, 5000)

    return () => {
      socket.off("event", onEvent)
      window.clearInterval(pollId)
    }
  }, [applyPlaybackState, setDisplayProgress])

  // Local progress clock while playing — fills gaps between sparse server samples
  useEffect(() => {
    if (playbackState !== "playing" || isSeekDragging) return
    if (!hasProgress || durationMs == null || durationMs <= 0) return

    const tick = () => {
      const anchor = progressAnchorRef.current
      if (!anchor) return
      const next = Math.min(durationMs, anchor.progressMs + (Date.now() - anchor.atMs))
      setDisplayProgress(next)
    }

    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [playbackState, isSeekDragging, hasProgress, durationMs, setDisplayProgress])

  const commitVolume = useCallback((value: number) => {
    emitToSocket("SET_PLAYBACK_VOLUME", { volumePercent: value })
  }, [])

  const volumeMachine = useMemo(() => createSliderMachine(commitVolume), [commitVolume])
  const [volumeState, volumeSend] = useMachine(volumeMachine, {
    input: { initialValue: volumePercent },
  })

  useEffect(() => {
    volumeSend({ type: "SYNC_EXTERNAL", value: volumePercent })
  }, [volumePercent, volumeSend])

  const showScrubber = durationMs != null && durationMs > 0 && hasProgress
  const scrubMax = durationMs ?? 1
  const scrubValue = Math.min(displayProgressMs, scrubMax)

  const handleSeekDrag = (details: { value: number[] }) => {
    isSeekDraggingRef.current = true
    setIsSeekDragging(true)
    setDisplayProgress(details.value[0] ?? 0)
  }

  const handleSeekRelease = (details: { value: number[] }) => {
    const positionMs = Math.round(details.value[0] ?? 0)
    setDisplayProgress(positionMs)
    progressAnchorRef.current = { progressMs: positionMs, atMs: Date.now() }
    isSeekDraggingRef.current = false
    setIsSeekDragging(false)
    emitToSocket("SEEK_PLAYBACK", { positionMs })
  }

  if (!showScrubber && !supportsVolume) return null

  return (
    <VStack
      align="stretch"
      gap={2}
      w="100%"
      mt={3}
      pt={2}
      borderTopWidth="1px"
      borderColor="primary.contrast/15"
      onClick={(e) => e.stopPropagation()}
    >
      {showScrubber && (
        <VStack align="stretch" gap={1} w="100%">
          <Slider.Root
            aria-label={["Seek"]}
            value={[scrubValue]}
            min={0}
            max={scrubMax}
            step={100}
            onValueChange={handleSeekDrag}
            onValueChangeEnd={handleSeekRelease}
            variant="solid"
            colorPalette="action"
            w="100%"
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumbs boxSize={3.5} />
            </Slider.Control>
          </Slider.Root>
          <HStack justify="space-between" w="100%">
            <Text fontSize="2xs" color="primary.contrast/60" fontVariantNumeric="tabular-nums">
              {formatMs(scrubValue)}
            </Text>
            <Text fontSize="2xs" color="primary.contrast/60" fontVariantNumeric="tabular-nums">
              {formatMs(scrubMax)}
            </Text>
          </HStack>
        </VStack>
      )}

      {supportsVolume && (
        <Tooltip content="Broadcast volume (show output, not your headphones)">
          <Box w="100%">
            <HStack gap={3} w="100%" align="center">
              <Box flexShrink={0} color="primary.contrast/70" aria-hidden>
                <SvgIcon icon={LuVolume2} boxSize={4} />
              </Box>
              <Slider.Root
                aria-label={["Broadcast volume"]}
                value={[volumeState.context.displayValue]}
                min={0}
                max={100}
                step={1}
                onValueChange={(details) => {
                  volumeSend({ type: "DRAG", value: details.value[0] ?? 0 })
                }}
                onValueChangeEnd={(details) => {
                  volumeSend({ type: "RELEASE", value: details.value[0] ?? 0 })
                }}
                variant="solid"
                colorPalette="action"
                flex="1"
              >
                <Slider.Control>
                  <Slider.Track>
                    <Slider.Range />
                  </Slider.Track>
                  <Slider.Thumbs boxSize={3.5} />
                </Slider.Control>
              </Slider.Root>
              <Text
                fontSize="xs"
                color="primary.contrast/60"
                minW="2.5rem"
                textAlign="right"
                fontVariantNumeric="tabular-nums"
              >
                {Math.round(volumeState.context.displayValue)}%
              </Text>
            </HStack>
          </Box>
        </Tooltip>
      )}
    </VStack>
  )
}
