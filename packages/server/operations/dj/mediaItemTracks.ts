import type { AppContext, ResolvedPhysicalMediaItem, TaggedMetadataSourceTrack } from "@repo/types"
import { withCachedJson } from "@repo/utils"

/** Daemon offline or never linked: the room has no bridge RPC client. */
export const BRIDGE_UNREACHABLE_MESSAGE =
  "Media Bridge is not connected. Ask the host to start the bridge on the DJ Mac."

/**
 * Shown when a Physical Media item resolves but the daemon never answers — most
 * often a DJ Mac daemon that is offline or running an older build.
 */
export const BRIDGE_TRACK_LISTING_FAILED_MESSAGE =
  "The Media Bridge didn't return this record's tracks. Ask the host to reconnect the DJ Mac daemon."

/** A non-local record whose album the room's source couldn't list. */
export const SOURCE_ALBUM_LISTING_FAILED_MESSAGE =
  "This record's tracks aren't available right now. Ask the host to check the room's music services."

export type MediaItemTracksFailure = { ok: false; message: string }

export type MediaItemTracksResult =
  | { ok: true; tracks: TaggedMetadataSourceTrack[] }
  | MediaItemTracksFailure

export type MediaItemTracksSource =
  | { kind: "playlist"; playlistId: string }
  | { kind: "album"; albumId: string; sourceId?: string }

/** The listing source for a resolved record (never client-supplied). */
export function mediaItemTracksSource(resolved: ResolvedPhysicalMediaItem): MediaItemTracksSource {
  return resolved.kind === "album"
    ? { kind: "album", albumId: resolved.albumId, sourceId: resolved.sourceId }
    : { kind: "playlist", playlistId: resolved.playlistId }
}

/** Album listings from non-local sources, keyed per room (room credentials). */
const SOURCE_ALBUM_CACHE_TTL_SEC = 60 * 60

function sourceAlbumCacheKey(roomId: string, sourceId: string, albumId: string): string {
  return `metadata:album:v1:${roomId}:${sourceId}:${albumId}`
}

/**
 * Tracks on an album in one of the room's non-local metadata sources (e.g. a
 * picked Spotify record, ADR 0216), through the room's credentials. Null when
 * the source isn't available or the album can't be fetched.
 */
export async function fetchSourceAlbumTracks(params: {
  context: AppContext
  roomId: string
  sourceId: string
  albumId: string
}): Promise<TaggedMetadataSourceTrack[] | null> {
  const { context, roomId, sourceId, albumId } = params
  const id = albumId.trim()
  if (!id) return null
  return withCachedJson({
    cache: context.cache,
    key: sourceAlbumCacheKey(roomId, sourceId, id),
    ttlSeconds: SOURCE_ALBUM_CACHE_TTL_SEC,
    skipCache: (value) => value == null,
    fetch: async () => {
      try {
        const { AdapterService } = await import("../../services/AdapterService")
        const sources = await new AdapterService(context).getRoomMetadataSources(roomId)
        const api = sources.get(sourceId)?.api
        if (!api?.getAlbum) return null
        const got = await api.getAlbum(id)
        if (!got) return null
        return got.tracks.map((track) => ({ ...track, source: sourceId }))
      } catch (error: unknown) {
        console.warn(`[fetchSourceAlbumTracks] ${sourceId} album ${id} failed`, error)
        return null
      }
    },
  })
}

/**
 * Bridge half of a Physical Media track listing, shared by `BROWSE_MEDIA_ITEM`
 * and `LIST_MEDIA_ITEM_TRACKS`. Callers own authorization — held item (ADR 0099)
 * vs held-or-on-current-shop-offers (ADR 0103) — and pass the resolved source,
 * which never comes from the client.
 *
 * Album and playlist listings both use ADR 0108 Redis browse cache when `cache`
 * is provided (same keys as CatalogBrowse `getAlbum` / playlist track fetch).
 */
export async function fetchResolvedMediaItemTracks(params: {
  roomId: string
  source: MediaItemTracksSource
  /** Operation name for logs, e.g. `browseMediaItem`. */
  logLabel: string
  cache?: AppContext["cache"]
  /** Required for albums on non-local sources (ADR 0216). */
  context?: AppContext
}): Promise<MediaItemTracksResult> {
  const { roomId, source, logLabel, cache } = params
  if (source.kind === "album" && source.sourceId && source.sourceId !== "local") {
    const tracks = params.context
      ? await fetchSourceAlbumTracks({
          context: params.context,
          roomId,
          sourceId: source.sourceId,
          albumId: source.albumId,
        })
      : null
    if (!tracks) {
      console.warn(`[${logLabel}] ${source.sourceId} album ${source.albumId} returned no tracks`)
      return { ok: false, message: SOURCE_ALBUM_LISTING_FAILED_MESSAGE }
    }
    return { ok: true, tracks }
  }
  try {
    const { getBridgeRpcClient, fetchLocalPlaylistTracks, fetchLocalAlbumResult } = await import(
      "@repo/adapter-bridge"
    )
    const rpc = getBridgeRpcClient(roomId)
    if (!rpc) {
      return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
    }

    if (source.kind === "album") {
      const albumId = source.albumId.trim()
      if (!albumId) {
        return { ok: false, message: "albumId is required" }
      }
      const result = await fetchLocalAlbumResult({
        rpc,
        albumId,
        roomId,
        cache,
      })
      const tracks = result?.tracks
      if (!Array.isArray(tracks)) {
        console.warn(`[${logLabel}] getAlbum returned no tracks for ${albumId}`)
        return { ok: false, message: BRIDGE_TRACK_LISTING_FAILED_MESSAGE }
      }
      return {
        ok: true,
        tracks: tracks.map((track) => ({ ...track, source: "local" })),
      }
    }

    const playlistId = source.playlistId.trim()
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
