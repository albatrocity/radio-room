import type { AppContext, MetadataSourceTrack, TaggedMetadataSourceTrack } from "@repo/types"
import generateId from "../../lib/generateId"
import {
  getInFlightPreviewGeneration,
  getInFlightPreviewKey,
  setInFlightPreviewGeneration,
  storePreviewIdRedirect,
  type TrackPreviewGenerationResult,
} from "../data/trackPreviews"
import { BRIDGE_UNREACHABLE_MESSAGE, fetchResolvedMediaItemTracks } from "./mediaItemTracks"

type BrowseFailure = { ok: false; message: string }

export async function listMediaItemTracks(params: {
  context: AppContext
  roomId: string
  userId: string
  mediaKey: string
}): Promise<
  | {
      ok: true
      mediaKey: string
      name: string
      tracks: TaggedMetadataSourceTrack[]
    }
  | BrowseFailure
> {
  const { context, roomId, userId, mediaKey } = params
  const key = mediaKey?.trim() ?? ""
  if (!key) {
    return { ok: false, message: "mediaKey is required" }
  }

  const resolved = context.pluginRegistry?.resolvePreviewableMediaItem
    ? await context.pluginRegistry.resolvePreviewableMediaItem({ roomId, userId, mediaKey: key })
    : null
  if (!resolved) {
    return { ok: false, message: "You can't preview that item" }
  }

  const listed = await fetchResolvedMediaItemTracks({
    roomId,
    source:
      resolved.kind === "album"
        ? { kind: "album", albumId: resolved.albumId }
        : { kind: "playlist", playlistId: resolved.playlistId },
    logLabel: "listMediaItemTracks",
    cache: context.cache,
  })
  if (!listed.ok) return listed

  return {
    ok: true,
    mediaKey: resolved.item.mediaKey,
    name: resolved.item.name,
    tracks: listed.tracks,
  }
}

async function authorizeLocalCatalogPreview(params: {
  context: AppContext
  roomId: string
  userId: string
  trackId: string
}): Promise<{ ok: true } | BrowseFailure> {
  const { context, roomId, userId, trackId } = params
  if (context.metadataSourceAccess) {
    const allowed = await context.metadataSourceAccess.canAccess({
      roomId,
      userId,
      sourceId: "local",
      action: "search",
    })
    if (!allowed) {
      return { ok: false, message: "You do not have access to this metadata source" }
    }
  }

  const shelves = context.metadataSourceAccess?.getLocalCatalogShelves
    ? await context.metadataSourceAccess.getLocalCatalogShelves(roomId, userId)
    : undefined
  const playlistIds = shelves?.playlistIds
  const albumIds = shelves?.albumIds

  const { getBridgeRpcClient, checkLocalTrackPlaylistMembership } = await import(
    "@repo/adapter-bridge"
  )
  const rpc = getBridgeRpcClient(roomId)
  if (!rpc) {
    return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
  }

  const hasShelfFilter =
    (playlistIds?.length ?? 0) > 0 || (albumIds?.length ?? 0) > 0
  const memberOf = await checkLocalTrackPlaylistMembership({
    rpc,
    trackId,
    playlistIds: playlistIds ?? [],
    albumIds: albumIds ?? [],
  })

  if (
    hasShelfFilter &&
    memberOf.playlistIds.length === 0 &&
    memberOf.albumIds.length === 0
  ) {
    return { ok: false, message: "You can't preview that track" }
  }

  return { ok: true }
}

async function authorizeMediaItemTrackPreview(params: {
  context: AppContext
  roomId: string
  userId: string
  mediaKey: string
  trackId: string
}): Promise<{ ok: true; track: MetadataSourceTrack } | BrowseFailure> {
  const { context, roomId, userId, mediaKey, trackId } = params
  const resolved = context.pluginRegistry?.resolvePreviewableMediaItem
    ? await context.pluginRegistry.resolvePreviewableMediaItem({ roomId, userId, mediaKey })
    : null
  if (!resolved) {
    return { ok: false, message: "You can't preview that item" }
  }

  const listed = await fetchResolvedMediaItemTracks({
    roomId,
    source:
      resolved.kind === "album"
        ? { kind: "album", albumId: resolved.albumId }
        : { kind: "playlist", playlistId: resolved.playlistId },
    logLabel: "authorizeMediaItemTrackPreview",
    cache: context.cache,
  })
  if (!listed.ok) return listed

  const track = listed.tracks.find((t) => t.id === trackId)
  if (!track) {
    return { ok: false, message: "You can't preview that track" }
  }
  return { ok: true, track }
}

function trackFromPreviewMeta(meta: {
  title?: string
  artist?: string
  album?: string
  discNumber?: number
  trackNumber?: number
  trackDurationMs?: number
}): MetadataSourceTrack | null {
  if (!meta.title) return null
  return {
    id: "",
    title: meta.title,
    urls: [],
    artists: meta.artist
      ? [{ id: "", title: meta.artist, urls: [] }]
      : [],
    album: {
      id: "",
      title: meta.album ?? "",
      urls: [],
      artists: [],
      releaseDate: "",
      releaseDatePrecision: "year",
      totalTracks: 0,
      label: "",
      images: [],
    },
    duration: meta.trackDurationMs ?? 0,
    explicit: false,
    trackNumber: meta.trackNumber ?? 0,
    discNumber: meta.discNumber ?? 0,
    popularity: 0,
    images: [],
  }
}

export async function getTrackPreview(params: {
  context: AppContext
  roomId: string
  userId: string
  trackId: string
  mediaKey?: string
  source?: string
}): Promise<
  | { ok: true; url: string; durationMs: number; cached: boolean }
  | BrowseFailure
> {
  const { context, roomId, userId, trackId } = params
  const id = trackId?.trim() ?? ""
  if (!id) {
    return { ok: false, message: "trackId is required" }
  }

  let knownTrack: MetadataSourceTrack | undefined
  const mediaKey = params.mediaKey?.trim()
  if (mediaKey) {
    const auth = await authorizeMediaItemTrackPreview({
      context,
      roomId,
      userId,
      mediaKey,
      trackId: id,
    })
    if (!auth.ok) return auth
    knownTrack = auth.track
  } else if (params.source === "local" || !params.source) {
    const auth = await authorizeLocalCatalogPreview({ context, roomId, userId, trackId: id })
    if (!auth.ok) return auth
  } else {
    return { ok: false, message: "Previews are only available for Local tracks" }
  }

  const { fingerprintTrack } = await import("../../services/mediaFingerprint")
  const { resolveMediaLibraryId } = await import("../bridge/bridgeDaemonId")
  const {
    getPreviewPointer,
    headPreviewByFingerprint,
    ensurePreviewObject,
  } = await import("../../services/MediaObjectCache")

  const libraryId = await resolveMediaLibraryId({ context, roomId })
  const fingerprintHash = knownTrack ? fingerprintTrack(knownTrack) : null

  const pointerHit = await getPreviewPointer({
    context,
    fingerprintHash,
    libraryId,
    trackId: id,
  })
  if (pointerHit) {
    return {
      ok: true,
      url: pointerHit.url,
      durationMs: pointerHit.durationMs,
      cached: true,
    }
  }

  if (fingerprintHash) {
    const s3Hit = await headPreviewByFingerprint({ context, fingerprintHash })
    if (s3Hit) {
      return {
        ok: true,
        url: s3Hit.url,
        durationMs: s3Hit.durationMs,
        cached: true,
      }
    }
  }

  const inflightKey = getInFlightPreviewKey(roomId, id)
  const inflight = getInFlightPreviewGeneration(inflightKey)
  if (inflight) {
    return await previewResultFromGeneration(inflight, true)
  }

  const generation = (async (): Promise<TrackPreviewGenerationResult> => {
    try {
      const { getBridgeRpcClient, fetchTrackPreview } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) {
        return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
      }
      const clip = await fetchTrackPreview({ rpc, trackId: id })
      if (!clip.ok) {
        return { ok: false, message: clip.error || BRIDGE_UNREACHABLE_MESSAGE }
      }

      let fp = fingerprintHash
      if (!fp && clip.meta) {
        const fromMeta = trackFromPreviewMeta(clip.meta)
        if (fromMeta) fp = fingerprintTrack(fromMeta)
      }

      const stored = await ensurePreviewObject({
        context,
        fingerprintHash: fp,
        libraryId,
        trackId: id,
        base64Data: clip.data,
        mimeType: clip.mimeType,
        durationMs: clip.durationMs,
      })

      const previewId = generateId()
      await storePreviewIdRedirect({
        context,
        roomId,
        previewId,
        trackId: id,
        url: stored.url,
        mimeType: clip.mimeType,
      })

      return { ok: true, url: stored.url, durationMs: clip.durationMs, previewId }
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to generate track preview"
      return { ok: false, message }
    }
  })()

  setInFlightPreviewGeneration(inflightKey, generation)
  return await previewResultFromGeneration(generation, false)
}

async function previewResultFromGeneration(
  generation: Promise<TrackPreviewGenerationResult>,
  cached: boolean,
): Promise<
  | { ok: true; url: string; durationMs: number; cached: boolean }
  | BrowseFailure
> {
  try {
    const result = await generation
    if (!result.ok) return result
    return {
      ok: true,
      url: result.url,
      durationMs: result.durationMs,
      cached,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message ? error.message : "Failed to generate track preview"
    return { ok: false, message }
  }
}
