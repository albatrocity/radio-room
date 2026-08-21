import type {
  AppContext,
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataBrowseCapabilities,
  MetadataSource,
  PhysicalMediaItem,
  TaggedMetadataSourceTrack,
} from "@repo/types"
import {
  isMetadataSourceAuthFailure,
  metadataSourceSupportsBrowse,
  resolveBrowseCapabilities,
} from "@repo/utils"
import { AdapterService } from "../../services/AdapterService"
import { findRoom } from "../data"
import { fetchResolvedMediaItemTracks } from "./mediaItemTracks"
import { publishMetadataAuthError } from "./metadataAuthError"

async function localCatalogFilterOptions(
  context: AppContext,
  roomId: string,
  userId: string,
  source: string,
): Promise<{ playlistIds?: string[]; albumIds?: string[] } | undefined> {
  if (source !== "local" || !context.metadataSourceAccess) return undefined
  const access = context.metadataSourceAccess
  if (typeof access.getLocalCatalogShelves === "function") {
    const shelves = await access.getLocalCatalogShelves(roomId, userId)
    if (!shelves) return undefined
    const out: { playlistIds?: string[]; albumIds?: string[] } = {}
    if (shelves.playlistIds.length) out.playlistIds = shelves.playlistIds
    if (shelves.albumIds.length) out.albumIds = shelves.albumIds
    return out.playlistIds || out.albumIds ? out : undefined
  }
  if (typeof access.getLocalCatalogPlaylistIds === "function") {
    const playlistIds = await access.getLocalCatalogPlaylistIds(roomId, userId)
    return playlistIds?.length ? { playlistIds } : undefined
  }
  return undefined
}

export type ResolveBrowseSourceResult =
  | { ok: true; metadataSource: MetadataSource }
  | { ok: false; message: string }

export async function resolveBrowseMetadata(params: {
  adapterService: AdapterService
  roomId: string
  metadataSourceIds: string[]
}): Promise<{
  browseableSourceIds: string[]
  browseSourceCapabilities: Record<string, MetadataBrowseCapabilities>
}> {
  const { adapterService, roomId, metadataSourceIds } = params
  if (metadataSourceIds.length === 0) {
    return { browseableSourceIds: [], browseSourceCapabilities: {} }
  }
  const sources = await adapterService.getRoomMetadataSources(roomId)
  const browseableSourceIds: string[] = []
  const browseSourceCapabilities: Record<string, MetadataBrowseCapabilities> = {}
  for (const id of metadataSourceIds) {
    const src = sources.get(id)
    if (!src || !metadataSourceSupportsBrowse(src.api)) continue
    browseableSourceIds.push(id)
    browseSourceCapabilities[id] = resolveBrowseCapabilities(src.api)
  }
  return { browseableSourceIds, browseSourceCapabilities }
}

export async function resolveBrowseSource(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
}): Promise<ResolveBrowseSourceResult> {
  const { context, adapterService, roomId, userId, source } = params
  if (!source) {
    return { ok: false, message: "source is required" }
  }

  if (context.metadataSourceAccess) {
    const allowed = await context.metadataSourceAccess.canAccess({
      roomId,
      userId,
      sourceId: source,
      action: "search",
    })
    if (!allowed) {
      return { ok: false, message: "You do not have access to this metadata source" }
    }
  }

  const sources = await adapterService.getRoomMetadataSources(roomId)
  const metadataSource = sources.get(source)
  if (!metadataSource) {
    return { ok: false, message: "Metadata source not available" }
  }
  if (!metadataSourceSupportsBrowse(metadataSource.api)) {
    return { ok: false, message: "Metadata source does not support browse" }
  }
  return { ok: true, metadataSource }
}

export async function getEffectiveMetadataSources(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
}): Promise<{
  metadataSourceIds: string[]
  browseableSourceIds: string[]
  browseSourceCapabilities: Record<string, MetadataBrowseCapabilities>
  myMedia: PhysicalMediaItem[]
}> {
  const { context, adapterService, roomId, userId } = params
  let metadataSourceIds: string[]
  if (!context.metadataSourceAccess) {
    const room = await findRoom({ context, roomId })
    metadataSourceIds = room?.metadataSourceIds ?? []
  } else {
    metadataSourceIds = await context.metadataSourceAccess.getEffectiveSourceIdsForUser(
      roomId,
      userId,
      "search",
    )
  }

  const browse = await resolveBrowseMetadata({
    adapterService,
    roomId,
    metadataSourceIds,
  })
  const myMedia =
    metadataSourceIds.includes("local") && context.pluginRegistry?.listPhysicalMediaItems
      ? await context.pluginRegistry.listPhysicalMediaItems({ roomId, userId })
      : []
  return { metadataSourceIds, ...browse, myMedia }
}

type BrowseFailure = { ok: false; message: string; authFailure?: { status: 401; source: string } }
type BrowseListSuccess<T> = { ok: true; source: string; items: T[]; total?: number }

async function withBrowseAuthHandling<T>(params: {
  context: AppContext
  roomId: string
  source: string
  run: () => Promise<T>
  failureMessage: string
}): Promise<T | BrowseFailure> {
  const { context, roomId, source, run, failureMessage } = params
  try {
    return await run()
  } catch (error: unknown) {
    console.error(failureMessage, error)
    const room = await findRoom({ context, roomId })
    if (room) {
      await publishMetadataAuthError({
        context,
        roomId,
        creatorUserId: room.creator,
        error,
        source,
      })
    }
    const message =
      error instanceof Error && error.message ? error.message : failureMessage
    return {
      ok: false,
      message,
      ...(isMetadataSourceAuthFailure(error) ? { authFailure: { status: 401 as const, source } } : {}),
    }
  }
}

export async function browseArtists(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  query?: string
  offset?: number
  limit?: number
}): Promise<BrowseListSuccess<MetadataBrowseArtist> | BrowseFailure> {
  const { context, adapterService, roomId, userId, source, query, offset, limit } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  const catalogFilter = await localCatalogFilterOptions(context, roomId, userId, source)

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse artists",
    run: async () => {
      const listed = await resolved.metadataSource.api.listArtists!({
        query,
        offset,
        limit,
        ...catalogFilter,
      })
      return {
        ok: true as const,
        source,
        items: listed.items,
        total: listed.total,
      }
    },
  })
  return result
}

export async function browseAlbums(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  query?: string
  offset?: number
  limit?: number
}): Promise<BrowseListSuccess<MetadataBrowseAlbum> | BrowseFailure> {
  const { context, adapterService, roomId, userId, source, query, offset, limit } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  if (typeof resolved.metadataSource.api.listAlbums !== "function") {
    return { ok: false, message: "Metadata source does not support album browse" }
  }

  const catalogFilter = await localCatalogFilterOptions(context, roomId, userId, source)

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse albums",
    run: async () => {
      const listed = await resolved.metadataSource.api.listAlbums!({
        query,
        offset,
        limit,
        ...catalogFilter,
      })
      return {
        ok: true as const,
        source,
        items: listed.items,
        total: listed.total,
      }
    },
  })
  return result
}

export async function browseArtist(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  artistId: string
}): Promise<
  | { ok: true; source: string; artist: MetadataBrowseArtist; albums: MetadataBrowseAlbum[] }
  | BrowseFailure
> {
  const { context, adapterService, roomId, userId, source, artistId } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  if (!artistId) {
    return { ok: false, message: "artistId is required" }
  }

  const catalogFilter = await localCatalogFilterOptions(context, roomId, userId, source)

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse artist",
    run: async () => {
      const got = await resolved.metadataSource.api.getArtist!(artistId, catalogFilter)
      if (!got) {
        return { ok: false as const, message: "Artist not found" }
      }
      return {
        ok: true as const,
        source,
        artist: got.artist,
        albums: got.albums,
      }
    },
  })
  return result
}

export async function browseAlbum(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  albumId: string
}): Promise<
  | {
      ok: true
      source: string
      album: MetadataBrowseAlbum
      tracks: TaggedMetadataSourceTrack[]
    }
  | BrowseFailure
> {
  const { context, adapterService, roomId, userId, source, albumId } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  if (!albumId) {
    return { ok: false, message: "albumId is required" }
  }

  const catalogFilter = await localCatalogFilterOptions(context, roomId, userId, source)

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse album",
    run: async () => {
      const got = await resolved.metadataSource.api.getAlbum!(albumId, catalogFilter)
      if (!got) {
        return { ok: false as const, message: "Album not found" }
      }
      const tracks = got.tracks.map((track) => ({
        ...track,
        source,
      }))
      return {
        ok: true as const,
        source,
        album: got.album,
        tracks,
      }
    },
  })
  return result
}

export async function browseMediaItem(params: {
  context: AppContext
  roomId: string
  userId: string
  mediaKey: string
}): Promise<
  | {
      ok: true
      source: "local"
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

  const resolved = context.pluginRegistry?.resolvePhysicalMediaItem
    ? await context.pluginRegistry.resolvePhysicalMediaItem({ roomId, userId, mediaKey: key })
    : null
  if (!resolved) {
    return { ok: false, message: "You don't have that item" }
  }

  const listed = await fetchResolvedMediaItemTracks({
    roomId,
    source:
      resolved.kind === "album"
        ? { kind: "album", albumId: resolved.albumId }
        : { kind: "playlist", playlistId: resolved.playlistId },
    logLabel: "browseMediaItem",
    cache: context.cache,
  })
  if (!listed.ok) return listed

  return {
    ok: true,
    source: "local",
    mediaKey: resolved.item.mediaKey,
    name: resolved.item.name,
    tracks: listed.tracks,
  }
}
