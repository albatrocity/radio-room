import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  Slider,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { LuPause, LuPlay, LuRefreshCcw, LuTrash2 } from "react-icons/lu"
import type { VoicemailListItem } from "@repo/types"

import {
  emitToSocket,
  subscribeById,
  unsubscribeById,
} from "../actors/socketActor"
import {
  useCurrentRoom,
  useIsAdmin,
  useMediaBridgeConnected,
  useSettings,
} from "../hooks/useActors"
import { toast } from "../lib/toasts"

// ---------------------------------------------------------------------------
// Payload shapes (match packages/server/handlers/voicemailAdminHandlersAdapter.ts)
// ---------------------------------------------------------------------------

type ListVoicemailsResultEvent = {
  type: "LIST_VOICEMAILS_RESULT"
  data: {
    from: string
    to: string
    truncated: boolean
    items: VoicemailListItem[]
  }
}

type PlayVoicemailResultEvent = {
  type: "PLAY_VOICEMAIL_RESULT"
  data: {
    id: string
    url: string
    durationMs: number
    label: string | null
    /** Server attempted to call bridge `playUrl`. */
    bridgeAttempted: boolean
    /** Bridge `playUrl` RPC succeeded (daemon acked). */
    bridgeOk?: boolean
  }
}

type HideVoicemailSuccessEvent = {
  type: "HIDE_VOICEMAIL_SUCCESS"
  data: { id: string }
}

type PauseVoicemailSuccessEvent = { type: "PAUSE_VOICEMAIL_SUCCESS"; data: unknown }
type SeekVoicemailSuccessEvent = { type: "SEEK_VOICEMAIL_SUCCESS"; data: { positionMs: number } }
type GetVoicemailPlaybackResultEvent = {
  type: "GET_VOICEMAIL_PLAYBACK_RESULT"
  data: {
    state: "playing" | "paused" | "stopped"
    progressMs: number | null
    durationMs: number | null
    observed: boolean
  }
}

type FailureEvent = {
  type:
    | "LIST_VOICEMAILS_FAILURE"
    | "PLAY_VOICEMAIL_FAILURE"
    | "HIDE_VOICEMAIL_FAILURE"
    | "PAUSE_VOICEMAIL_FAILURE"
    | "SEEK_VOICEMAIL_FAILURE"
    | "GET_VOICEMAIL_PLAYBACK_FAILURE"
  data: { code: string; message: string }
}

type DeckServerEvent =
  | ListVoicemailsResultEvent
  | PlayVoicemailResultEvent
  | HideVoicemailSuccessEvent
  | PauseVoicemailSuccessEvent
  | SeekVoicemailSuccessEvent
  | GetVoicemailPlaybackResultEvent
  | FailureEvent

const DECK_EVENT_TYPES = [
  "LIST_VOICEMAILS_RESULT",
  "LIST_VOICEMAILS_FAILURE",
  "PLAY_VOICEMAIL_RESULT",
  "PLAY_VOICEMAIL_FAILURE",
  "HIDE_VOICEMAIL_SUCCESS",
  "HIDE_VOICEMAIL_FAILURE",
  "PAUSE_VOICEMAIL_SUCCESS",
  "PAUSE_VOICEMAIL_FAILURE",
  "SEEK_VOICEMAIL_SUCCESS",
  "SEEK_VOICEMAIL_FAILURE",
  "GET_VOICEMAIL_PLAYBACK_RESULT",
  "GET_VOICEMAIL_PLAYBACK_FAILURE",
]

/** Bridge transport polling cadence (ms). Matches the daemon's own 1s mpv poll. */
const BRIDGE_POLL_INTERVAL_MS = 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_WINDOW_DAYS = 30

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Format a `Date` as `YYYY-MM-DDTHH:MM` in the viewer's local timezone. */
function toDatetimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Parse a `<input type="datetime-local">` value as the viewer's local time. */
function fromDatetimeLocal(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00"
  const sec = Math.round(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${pad(s)}`
}

function formatRelative(createdAt: string, now: number): string {
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return createdAt
  const deltaSec = Math.max(0, Math.round((now - t) / 1000))
  if (deltaSec < 60) return `${deltaSec}s ago`
  const deltaMin = Math.round(deltaSec / 60)
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHr = Math.round(deltaMin / 60)
  if (deltaHr < 48) return `${deltaHr}h ago`
  const deltaDay = Math.round(deltaHr / 24)
  return `${deltaDay}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Admin-only voicemail deck (ADR 0212, plan phase 5). Rendered next to the
 * schedule panel whenever the room's active segment role is `voicemail` and the
 * viewer is a room admin. Transport is browser-local in phase 5: a single
 * `<audio>` element plays whichever row the admin selects. Phase 6 will route
 * playback through the bridge `playUrl` RPC and fall back here when the bridge
 * is unavailable.
 */
export default function VoicemailDeck() {
  const isAdmin = useIsAdmin()
  const room = useCurrentRoom()
  const settings = useSettings()
  const bridgeConnected = useMediaBridgeConnected()
  const isVoicemailSegment = settings.activeSegmentRole === "voicemail"
  const visible = isAdmin && isVoicemailSegment && !!room?.id

  // Datetime window: default last 30 days → now. Changing either refetches.
  const [from, setFrom] = useState<Date>(() => new Date(Date.now() - DEFAULT_WINDOW_DAYS * MS_PER_DAY))
  const [to, setTo] = useState<Date>(() => new Date())
  const fromValue = useMemo(() => toDatetimeLocal(from), [from])
  const toValue = useMemo(() => toDatetimeLocal(to), [to])

  const [items, setItems] = useState<VoicemailListItem[]>([])
  const [truncated, setTruncated] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  // Player state. `playbackUrl` is the URL currently loaded into the <audio>
  // element — it may be the row's original list URL, or a fresh presigned GET
  // returned by PLAY_VOICEMAIL_RESULT.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [playError, setPlayError] = useState<string | null>(null)
  /**
   * When true, the DJ Mac's URL sidechain owns playback. The browser `<audio>`
   * element is muted / paused; transport flows through PAUSE_VOICEMAIL /
   * SEEK_VOICEMAIL / GET_VOICEMAIL_PLAYBACK. Flips to false the moment the
   * bridge disconnects, acks `bridgeOk: false`, or reports `observed: false`.
   */
  const [bridgeOwnsPlayback, setBridgeOwnsPlayback] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Mirror of `selectedId` so the long-lived socket subscriber can read the
  // current selection without re-subscribing on every selection change.
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // Same pattern for `bridgeOwnsPlayback` — the GET_VOICEMAIL_PLAYBACK_RESULT
  // handler only updates when the bridge still owns transport.
  const bridgeOwnsPlaybackRef = useRef(false)
  useEffect(() => {
    bridgeOwnsPlaybackRef.current = bridgeOwnsPlayback
  }, [bridgeOwnsPlayback])

  // Request LIST_VOICEMAILS. Called on mount + whenever the from/to window
  // changes while the deck is visible.
  const requestList = useCallback(
    (f: Date, t: Date) => {
      if (!visible) return
      if (!(f.getTime() < t.getTime())) {
        setListError("End time must be after start time.")
        return
      }
      setListError(null)
      setListLoading(true)
      emitToSocket("LIST_VOICEMAILS", {
        from: f.toISOString(),
        to: t.toISOString(),
      })
    },
    [visible],
  )

  // Subscribe to socket responses only while the deck is visible.
  useEffect(() => {
    if (!visible || !room?.id) return
    const subscriptionId = `voicemail-deck-${room.id}`
    subscribeById(subscriptionId, {
      send: (raw) => {
        const event = raw as DeckServerEvent
        switch (event.type) {
          case "LIST_VOICEMAILS_RESULT": {
            setListLoading(false)
            setListError(null)
            setItems(event.data.items)
            setTruncated(event.data.truncated)
            return
          }
          case "LIST_VOICEMAILS_FAILURE": {
            setListLoading(false)
            setItems([])
            setTruncated(false)
            setListError(event.data.message || "Failed to load voicemails.")
            return
          }
          case "PLAY_VOICEMAIL_RESULT": {
            setPlayError(null)
            setSelectedId(event.data.id)
            setPlaybackUrl(event.data.url)
            setDurationMs(event.data.durationMs)
            setPositionMs(0)
            // Bridge owns transport only when the server attempted the RPC
            // AND it acked ok. Otherwise we fall through to the browser
            // `<audio>` path — same behavior as a disconnected bridge.
            setBridgeOwnsPlayback(
              event.data.bridgeAttempted === true && event.data.bridgeOk === true,
            )
            return
          }
          case "PLAY_VOICEMAIL_FAILURE": {
            setPlayError(event.data.message || "Failed to start voicemail.")
            setPlaying(false)
            return
          }
          case "HIDE_VOICEMAIL_SUCCESS": {
            setItems((prev) => prev.filter((row) => row.id !== event.data.id))
            // If the hidden row was selected, drop the player.
            if (selectedIdRef.current === event.data.id) {
              setSelectedId(null)
              setPlaybackUrl(null)
              setPlaying(false)
              setPositionMs(0)
              setBridgeOwnsPlayback(false)
            }
            return
          }
          case "HIDE_VOICEMAIL_FAILURE": {
            toast({
              title: "Could not hide voicemail",
              description: event.data.message,
              status: "error",
              duration: 4000,
            })
            return
          }
          case "PAUSE_VOICEMAIL_SUCCESS": {
            // Bridge paused — stay in bridge mode and reflect it in local UI.
            setPlaying(false)
            return
          }
          case "SEEK_VOICEMAIL_SUCCESS": {
            // Position already reflected optimistically in the slider handler.
            return
          }
          case "GET_VOICEMAIL_PLAYBACK_RESULT": {
            // Observed=false indicates an old pack or disabled sidechain —
            // fall back to <audio>, keeping the current presigned URL.
            if (!event.data.observed) {
              setBridgeOwnsPlayback(false)
              return
            }
            if (!bridgeOwnsPlaybackRef.current) return
            setPlaying(event.data.state === "playing")
            if (event.data.progressMs != null) {
              setPositionMs(event.data.progressMs)
            }
            if (event.data.durationMs != null && event.data.durationMs > 0) {
              setDurationMs(event.data.durationMs)
            }
            return
          }
          case "PAUSE_VOICEMAIL_FAILURE":
          case "SEEK_VOICEMAIL_FAILURE":
          case "GET_VOICEMAIL_PLAYBACK_FAILURE": {
            // Any transport failure flips us back to local <audio> so the
            // admin's scrubber keeps working.
            setBridgeOwnsPlayback(false)
            return
          }
        }
      },
      eventTypes: DECK_EVENT_TYPES,
    })
    return () => unsubscribeById(subscriptionId)
  }, [visible, room?.id])

  // Initial fetch + refetch on window / visibility change.
  useEffect(() => {
    if (!visible) return
    requestList(from, to)
  }, [visible, from, to, requestList])

  // Reset player + list when the deck hides (segment changes away from voicemail).
  useEffect(() => {
    if (visible) return
    setItems([])
    setTruncated(false)
    setListError(null)
    setSelectedId(null)
    setPlaybackUrl(null)
    setPlaying(false)
    setPositionMs(0)
    setDurationMs(0)
    setPlayError(null)
    setBridgeOwnsPlayback(false)
  }, [visible])

  // Bridge disconnect → immediately hand playback back to <audio>.
  useEffect(() => {
    if (!bridgeConnected) setBridgeOwnsPlayback(false)
  }, [bridgeConnected])

  // Poll the ducked URL player while the bridge owns playback. The daemon
  // publishes no STATE events for URL players (ADR 0212), so the scrubber
  // relies on getPlayback instead.
  useEffect(() => {
    if (!visible || !bridgeOwnsPlayback) return
    emitToSocket("GET_VOICEMAIL_PLAYBACK", {})
    const id = window.setInterval(() => {
      emitToSocket("GET_VOICEMAIL_PLAYBACK", {})
    }, BRIDGE_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [visible, bridgeOwnsPlayback])

  // Auto-play when a new playbackUrl arrives (PLAY_VOICEMAIL_RESULT) and the
  // bridge has NOT taken over. When the DJ Mac is playing, the browser
  // `<audio>` element stays silent (no `play()` call) so the admin doesn't
  // hear two copies.
  useEffect(() => {
    const el = audioRef.current
    if (!el || !playbackUrl) return
    if (bridgeOwnsPlayback) {
      // Make sure any local playback from a prior row stops.
      try {
        el.pause()
      } catch {
        /* ignore */
      }
      return
    }
    // Reload and play. Browsers reject play() from non-user-initiated effects
    // on autoplay-restricted origins, but PLAY was triggered by a user click.
    el.load()
    void el.play().catch((err) => {
      console.error("[VoicemailDeck] audio.play() rejected:", err)
      setPlayError("Browser blocked playback. Try the controls directly.")
      setPlaying(false)
    })
  }, [playbackUrl, bridgeOwnsPlayback])

  const onFromChange = useCallback((value: string) => {
    const d = fromDatetimeLocal(value)
    if (d) setFrom(d)
  }, [])

  const onToChange = useCallback((value: string) => {
    const d = fromDatetimeLocal(value)
    if (d) setTo(d)
  }, [])

  const handleRefresh = useCallback(() => {
    requestList(from, to)
  }, [from, to, requestList])

  const handlePlayRow = useCallback((row: VoicemailListItem) => {
    setPlayError(null)
    emitToSocket("PLAY_VOICEMAIL", { id: row.id })
  }, [])

  const handleHide = useCallback((row: VoicemailListItem) => {
    emitToSocket("HIDE_VOICEMAIL", { id: row.id })
  }, [])

  const handleTogglePlay = useCallback(() => {
    if (bridgeOwnsPlayback) {
      // Bridge owns transport. Pause goes through the socket; resume reuses
      // PLAY_VOICEMAIL (mode: "replace" at the daemon) because the sidechain
      // player keeps the file loaded between pauses.
      if (playing) {
        emitToSocket("PAUSE_VOICEMAIL", {})
      } else if (selectedIdRef.current) {
        emitToSocket("PLAY_VOICEMAIL", { id: selectedIdRef.current })
      }
      return
    }
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      void el.play().catch((err) => {
        console.error("[VoicemailDeck] audio.play() rejected:", err)
      })
    } else {
      el.pause()
    }
  }, [bridgeOwnsPlayback, playing])

  const handleSeek = useCallback(
    (valueMs: number) => {
      if (!Number.isFinite(valueMs)) return
      const clamped = Math.max(0, valueMs)
      setPositionMs(clamped)
      if (bridgeOwnsPlayback) {
        emitToSocket("SEEK_VOICEMAIL", { positionMs: clamped })
        return
      }
      const el = audioRef.current
      if (!el) return
      try {
        el.currentTime = clamped / 1000
      } catch (err) {
        console.error("[VoicemailDeck] audio.currentTime failed:", err)
      }
    },
    [bridgeOwnsPlayback],
  )

  // Audio element event wiring.
  const handleLoadedMetadata = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    // `duration` can be Infinity on WebM blobs that lack cues/duration metadata;
    // in that case keep whatever the server sent (durationMs) from PLAY_VOICEMAIL_RESULT.
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDurationMs(Math.round(el.duration * 1000))
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    setPositionMs(Math.round(el.currentTime * 1000))
  }, [])

  if (!visible) return null

  // Relative times stay stable within a single render; a light "now" source is
  // enough (no ticker) because the sidebar re-renders on list changes anyway.
  const now = Date.now()

  const selectedRow = items.find((row) => row.id === selectedId)
  const selectedLabel = selectedRow?.label?.trim() || "Anonymous"

  return (
    <Box
      px={4}
      py={3}
      borderBottomWidth={1}
      borderBottomColor="secondaryBorder"
      w="100%"
    >
      <VStack align="stretch" gap={2}>
        <HStack justify="space-between">
          <Heading as="h3" size="sm">
            Voicemails
          </Heading>
          <HStack gap={1}>
            {truncated && (
              <Badge size="sm" colorPalette="yellow">
                Showing newest 200
              </Badge>
            )}
            <IconButton
              aria-label="Refresh voicemails"
              size="xs"
              variant="ghost"
              onClick={handleRefresh}
              disabled={listLoading}
            >
              <Icon as={LuRefreshCcw} />
            </IconButton>
          </HStack>
        </HStack>

        <HStack gap={2} align="end">
          <VStack align="stretch" gap={0} flex={1}>
            <Text fontSize="xs" color="fg.muted">
              From
            </Text>
            <Input
              size="xs"
              type="datetime-local"
              value={fromValue}
              onChange={(e) => onFromChange(e.target.value)}
              aria-label="Voicemail window start"
            />
          </VStack>
          <VStack align="stretch" gap={0} flex={1}>
            <Text fontSize="xs" color="fg.muted">
              To
            </Text>
            <Input
              size="xs"
              type="datetime-local"
              value={toValue}
              onChange={(e) => onToChange(e.target.value)}
              aria-label="Voicemail window end"
            />
          </VStack>
        </HStack>

        {listLoading && (
          <HStack py={1}>
            <Spinner size="sm" />
            <Text fontSize="sm">Loading voicemails…</Text>
          </HStack>
        )}

        {listError && (
          <Text fontSize="xs" color="red.500">
            {listError}
          </Text>
        )}

        {!listLoading && !listError && items.length === 0 && (
          <Text fontSize="sm" color="fg.muted">
            No voicemails in this window.
          </Text>
        )}

        <VStack align="stretch" gap={1} maxH="220px" overflowY="auto">
          {items.map((row) => {
            const isSelected = row.id === selectedId
            const rowLabel = row.label?.trim() || "Anonymous"
            return (
              <HStack
                key={row.id}
                justify="space-between"
                gap={2}
                py={1}
                borderBottomWidth="1px"
                borderColor="border.muted"
                fontSize="sm"
                bg={isSelected ? "bg.subtle" : undefined}
              >
                <VStack align="start" gap={0} minW={0} flex={1}>
                  <HStack gap={1}>
                    <Text fontWeight="medium" fontSize="xs" color="fg.muted">
                      {formatRelative(row.createdAt, now)}
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      · {formatDurationMs(row.durationMs)}
                    </Text>
                    {isSelected && (
                      <Badge size="sm" colorPalette="green">
                        Playing
                      </Badge>
                    )}
                  </HStack>
                  <Text lineClamp={1}>{rowLabel}</Text>
                </VStack>
                <HStack gap={1} flexShrink={0}>
                  <IconButton
                    size="xs"
                    variant="outline"
                    aria-label={`Play voicemail from ${rowLabel}`}
                    onClick={() => handlePlayRow(row)}
                  >
                    <Icon as={LuPlay} />
                  </IconButton>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    aria-label={`Hide voicemail from ${rowLabel}`}
                    onClick={() => handleHide(row)}
                  >
                    <Icon as={LuTrash2} />
                  </IconButton>
                </HStack>
              </HStack>
            )
          })}
        </VStack>

        {playbackUrl && (
          <VStack align="stretch" gap={2} pt={2} borderTopWidth={1} borderColor="border.muted">
            <HStack gap={2}>
              <IconButton
                size="sm"
                variant="solid"
                colorPalette="action"
                aria-label={playing ? "Pause voicemail" : "Resume voicemail"}
                onClick={handleTogglePlay}
              >
                <Icon as={playing ? LuPause : LuPlay} />
              </IconButton>
              <VStack align="start" gap={0} minW={0} flex={1}>
                <Text fontSize="xs" color="fg.muted" lineClamp={1}>
                  Now playing · {selectedLabel}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {formatDurationMs(positionMs)} / {formatDurationMs(durationMs)}
                </Text>
              </VStack>
            </HStack>
            <Slider.Root
              aria-label={["Voicemail position"]}
              min={0}
              max={Math.max(durationMs, 1)}
              step={100}
              value={[Math.min(positionMs, durationMs || positionMs)]}
              onValueChange={(details) => handleSeek(details.value[0] ?? 0)}
              variant="solid"
              colorPalette="action"
            >
              <Slider.Control>
                <Slider.Track>
                  <Slider.Range />
                </Slider.Track>
                <Slider.Thumbs boxSize={3} />
              </Slider.Control>
            </Slider.Root>
            {playError && (
              <Text fontSize="xs" color="red.500">
                {playError}
              </Text>
            )}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                if (bridgeOwnsPlayback) {
                  emitToSocket("PAUSE_VOICEMAIL", {})
                }
                const el = audioRef.current
                if (el) el.pause()
                setPlaybackUrl(null)
                setSelectedId(null)
                setPlaying(false)
                setPositionMs(0)
                setBridgeOwnsPlayback(false)
              }}
            >
              Stop
            </Button>
          </VStack>
        )}

        {/* Single shared audio element. Controls are driven by the buttons /
            slider above so we can reuse the same UI whenever phase 6 adds the
            bridge sidechain path. */}
        <audio
          ref={audioRef}
          src={playbackUrl ?? undefined}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setPositionMs(0)
          }}
          onError={() => {
            setPlayError("Playback error. The URL may have expired — try Play again.")
            setPlaying(false)
          }}
          style={{ display: "none" }}
        />
      </VStack>
    </Box>
  )
}
