import type { Room } from "@repo/types/Room"
import type { BridgeSnapshot } from "./types.js"
import { getRoomActivation } from "./activationState.js"

/** Stable ISO timestamp for HTTP GET before any `/sync` (avoids new identity every request). */
const BRIDGE_PRE_SYNC_ISO = "1970-01-01T00:00:00.000Z"

/** Minimal `Room` document for HTTP GET /rooms/:id and socket ROOM_SETTINGS. */
export function stubStudioBridgeRoom(
  roomId: string,
  snap: BridgeSnapshot | null,
  lastRefreshedAtIso: string,
): Room {
  const title = snap
    ? `Game Studio — ${snap.users.length} player(s)`
    : "Game Studio (start sandbox in Game Studio tab)"

  const activation = getRoomActivation(roomId)

  return {
    id: roomId,
    creator: "studio-bridge",
    type: "jukebox",
    /** Preview queue as authoritative (matches sandbox); avoids Spotify-delegated queue UX in studio-room. */
    playbackMode: "app-controlled",
    title,
    fetchMeta: false,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: true,
    createdAt: lastRefreshedAtIso,
    lastRefreshedAt: lastRefreshedAtIso,
    announceNowPlaying: true,
    announceUsernameChanges: true,
    showQueueCount: true,
    showQueueTracks: true,
    allowChatImages: false,
    public: true,
    showId: snap?.showId ?? undefined,
    activeSegmentId: activation?.activeSegmentId,
    activeShowSegmentId: activation?.activeShowSegmentId,
  }
}

/** Same room shape without `password` for ROOM_DATA payloads. */
export function stubRoomForRoomData(
  roomId: string,
  snap: BridgeSnapshot | null,
  lastRefreshedAtIso: string,
): Omit<Room, "password"> {
  const r = stubStudioBridgeRoom(roomId, snap, lastRefreshedAtIso)
  const { password: _p, ...rest } = r
  return rest
}

export { BRIDGE_PRE_SYNC_ISO }
