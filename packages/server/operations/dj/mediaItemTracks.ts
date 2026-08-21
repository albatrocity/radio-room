import type { AppContext, TaggedMetadataSourceTrack } from "@repo/types"

/** Daemon offline or never linked: the room has no bridge RPC client. */
export const BRIDGE_UNREACHABLE_MESSAGE =
  "Media Bridge is not connected. Ask the host to start the bridge on the DJ Mac."

/**
 * Shown when a Physical Media item resolves but the daemon never answers — most
 * often a DJ Mac daemon that is offline or running an older build.
 */
export const BRIDGE_TRACK_LISTING_FAILED_MESSAGE =
  "The Media Bridge didn't return this record's tracks. Ask the host to reconnect the DJ Mac daemon."

export type MediaItemTracksFailure = { ok: false; message: string }

export type MediaItemTracksResult =
  | { ok: true; tracks: TaggedMetadataSourceTrack[] }
  | MediaItemTracksFailure

/**
 * Bridge half of a Physical Media track listing, shared by `BROWSE_MEDIA_ITEM`
 * and `LIST_MEDIA_ITEM_TRACKS`. Callers own authorization — held item (ADR 0099)
 * vs held-or-on-current-shop-offers (ADR 0103) — and pass the resolved playlist
 * id, which never comes from the client.
 */
export async function fetchResolvedMediaItemTracks(params: {
  roomId: string
  playlistId: string
  /** Operation name for logs, e.g. `browseMediaItem`. */
  logLabel: string
  cache?: AppContext["cache"]
}): Promise<MediaItemTracksResult> {
  const { roomId, playlistId, logLabel, cache } = params
  try {
    const { getBridgeRpcClient, fetchLocalPlaylistTracks } = await import("@repo/adapter-bridge")
    const rpc = getBridgeRpcClient(roomId)
    if (!rpc) {
      return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
    }
    const listed = await fetchLocalPlaylistTracks({
      rpc,
      playlistId,
      roomId,
      cache,
    })
    if (!listed.ok) {
      console.warn(`[${logLabel}] listPlaylistTracks failed for ${playlistId}: ${listed.error}`)
      return { ok: false, message: BRIDGE_TRACK_LISTING_FAILED_MESSAGE }
    }
    return {
      ok: true,
      tracks: listed.tracks.map((track) => ({ ...track, source: "local" })),
    }
  } catch (error: unknown) {
    console.error(`[${logLabel}] failed to list media item tracks`, error)
    const message =
      error instanceof Error && error.message ? error.message : "Failed to list media item tracks"
    return { ok: false, message }
  }
}
