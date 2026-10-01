import type { AppContext, PluginPlaybackReadResult } from "@repo/types"

function playbackTrackId(track: unknown): string | null {
  if (track && typeof track === "object" && "id" in track) {
    return String((track as { id: string }).id)
  }
  return null
}

/**
 * Read the room's playback controller transport (ADR 0196). No admin or
 * playback-mode gate: any room whose controller implements `getPlayback`.
 * Shared by `PluginAPI.getPlayback` and anchored schedule recompute.
 */
export async function readRoomPlayback({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<PluginPlaybackReadResult> {
  const { AdapterService } = await import("../../services/AdapterService")
  const controller = await new AdapterService(context).getRoomPlaybackController(roomId)
  if (!controller) {
    return { success: false, message: "No playback controller configured for this room" }
  }
  const getPlayback = controller.api.getPlayback
  if (!getPlayback) {
    return { success: false, message: "Playback controller does not support reading state" }
  }

  try {
    const playback = await getPlayback()
    if (playback.observed === false) {
      return { success: false, message: "Playback state is unavailable" }
    }
    return {
      success: true,
      state: playback.state,
      trackId: playbackTrackId(playback.track),
      progressMs: typeof playback.progressMs === "number" ? playback.progressMs : null,
      durationMs: typeof playback.durationMs === "number" ? playback.durationMs : null,
    }
  } catch (e) {
    console.error("[readRoomPlayback] getPlayback failed:", e)
    return { success: false, message: "Failed to read playback state" }
  }
}
