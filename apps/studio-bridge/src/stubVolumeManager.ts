/**
 * Volume Manager preview stubs for Game Studio → Listening Room.
 *
 * The bridge does not run the real `@repo/plugin-volume-manager` plugin or
 * Spotify PlaybackController, so it fakes the slider store (`volume`) and
 * `EXECUTE_PLUGIN_ACTION` → `PLUGIN:volume-manager:VOLUME_CHANGED` flow.
 */

export const VOLUME_MANAGER_PLUGIN = "volume-manager"

const DEFAULT_VOLUME = 100

/** Per-room live volume for the slider preview. */
const volumeByRoom = new Map<string, number>()

function volumeFor(roomId: string): number {
  return volumeByRoom.get(roomId) ?? DEFAULT_VOLUME
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
  volumeByRoom.set(roomId, volume)

  return {
    success: true,
    events: [volumeChangedEvent(roomId, volume)],
  }
}
