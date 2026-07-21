/**
 * Volume + playback transport stubs for Game Studio → Listening Room (ADR 0078).
 *
 * The bridge does not run a real PlaybackController. It fakes:
 * - Built-in `GET_PLAYBACK_STATE` / `SEEK_PLAYBACK` / `SET_PLAYBACK_VOLUME`
 * - Legacy Volume Manager `EXECUTE_PLUGIN_ACTION` → `PLUGIN:volume-manager:VOLUME_CHANGED`
 *   (plugin Now Playing slider removed; action kept for config/admin previews)
 */

export const VOLUME_MANAGER_PLUGIN = "volume-manager"

const DEFAULT_VOLUME = 100
const DEFAULT_DURATION_MS = 180_000

type TransportState = {
  volume: number
  progressMs: number
  durationMs: number
  state: "playing" | "paused" | "stopped"
}

/** Per-room transport preview state. */
const transportByRoom = new Map<string, TransportState>()

function transportFor(roomId: string): TransportState {
  let t = transportByRoom.get(roomId)
  if (!t) {
    t = {
      volume: DEFAULT_VOLUME,
      progressMs: 30_000,
      durationMs: DEFAULT_DURATION_MS,
      state: "playing",
    }
    transportByRoom.set(roomId, t)
  }
  return t
}

function volumeFor(roomId: string): number {
  return transportFor(roomId).volume
}

export function buildStubVolumeComponentState(roomId: string): Record<string, unknown> {
  return { volume: volumeFor(roomId) }
}

export interface StubVolumeEvent {
  type: string
  data: Record<string, unknown>
}

function volumeChangedEvent(roomId: string, volume: number): StubVolumeEvent {
  return {
    type: `PLUGIN:${VOLUME_MANAGER_PLUGIN}:VOLUME_CHANGED`,
    data: { roomId, volume },
  }
}

export function runStubVolumeAction(
  roomId: string,
  action: string,
  params?: Record<string, unknown>,
): { success: boolean; message?: string; events: StubVolumeEvent[] } {
  if (action !== "setVolume") {
    return { success: false, message: `Unknown action: ${action}`, events: [] }
  }

  const raw = params?.volume
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { success: false, message: "Invalid volume", events: [] }
  }

  const volume = Math.round(Math.max(0, Math.min(100, raw)))
  const t = transportFor(roomId)
  t.volume = volume

  return {
    success: true,
    events: [volumeChangedEvent(roomId, volume)],
  }
}

export function stubGetPlaybackState(roomId: string): {
  state: "playing" | "paused" | "stopped"
  trackId: string
  canResume: boolean
  progressMs: number
  durationMs: number
  volumePercent: number
  supportsVolume: true
} {
  const t = transportFor(roomId)
  return {
    state: t.state,
    trackId: "studio-bridge-track",
    canResume: t.state !== "stopped",
    progressMs: t.progressMs,
    durationMs: t.durationMs,
    volumePercent: t.volume,
    supportsVolume: true,
  }
}

export function stubSeekPlayback(
  roomId: string,
  positionMs: number,
): { success: true; positionMs: number } | { success: false; message: string } {
  if (!Number.isFinite(positionMs) || positionMs < 0) {
    return { success: false, message: "Invalid seek position" }
  }
  const t = transportFor(roomId)
  const clamped = Math.min(Math.round(positionMs), t.durationMs)
  t.progressMs = clamped
  return { success: true, positionMs: clamped }
}

export function stubSetPlaybackVolume(
  roomId: string,
  volumePercent: number,
):
  | { success: true; volumePercent: number; events: StubVolumeEvent[] }
  | { success: false; message: string } {
  if (!Number.isFinite(volumePercent)) {
    return { success: false, message: "Invalid volume" }
  }
  const volume = Math.round(Math.max(0, Math.min(100, volumePercent)))
  const t = transportFor(roomId)
  t.volume = volume
  return {
    success: true,
    volumePercent: volume,
    events: [volumeChangedEvent(roomId, volume)],
  }
}
