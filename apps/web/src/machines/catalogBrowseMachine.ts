import { and, assign, setup } from "xstate"
import type {
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataSourceTrackWithSource,
} from "@repo/types"
import { emitToSocket } from "../actors/socketActor"

type RequestError = {
  message: string
  error?: unknown
  status?: number
  source?: string
}

type CachedAlbumEntry = {
  kind: "album"
  source: string
  album: MetadataBrowseAlbum
  tracks: MetadataSourceTrackWithSource[]
}

type CachedMediaEntry = {
  kind: "media"
  source: string
  mediaKey: string
  mediaName: string
  tracks: MetadataSourceTrackWithSource[]
}

type SessionCacheEntry = CachedAlbumEntry | CachedMediaEntry

/** Bounded in-session cache so breadcrumb back/forward skips socket round-trips (ADR 0108). */
const SESSION_CACHE_MAX = 16
const sessionCache = new Map<string, SessionCacheEntry>()

export function albumSessionCacheKey(source: string, albumId: string): string {
  return `album:${source}:${albumId}`
}

export function mediaSessionCacheKey(mediaKey: string): string {
  return `media:${mediaKey}`
}

function getSessionCache(key: string): SessionCacheEntry | undefined {
  const entry = sessionCache.get(key)
  if (!entry) return undefined
  // LRU: refresh insertion order
  sessionCache.delete(key)
  sessionCache.set(key, entry)
  return entry
}

function putSessionCache(key: string, entry: SessionCacheEntry): void {
  if (sessionCache.has(key)) sessionCache.delete(key)
  sessionCache.set(key, entry)
  while (sessionCache.size > SESSION_CACHE_MAX) {
    const oldest = sessionCache.keys().next().value
    if (oldest == null) break
    sessionCache.delete(oldest)
  }
}

/** Test helper: clear the CatalogBrowse session cache. */
export function clearCatalogBrowseSessionCache(): void {
  sessionCache.clear()
}

/** Page size for root Artists/Albums lists (daemon default-caps to the same). */
export const CATALOG_BROWSE_PAGE_SIZE = 50

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function pageHasMore<T>(params: {
  accumulated: T[]
  incoming: T[]
  previousLength: number
  total: number | undefined
  pageSize: number
}): boolean {
  if (params.incoming.length === 0) return false
  if (params.accumulated.length <= params.previousLength) return false
  if (typeof params.total === "number") return params.accumulated.length < params.total
  return params.incoming.length >= params.pageSize
}

function normalizeBrowseQuery(query: string | undefined): string {
  return query ?? ""
}

export interface CatalogBrowseContext {
  source: string | null
  artists: MetadataBrowseArtist[]
  artistsTotal: number | undefined
  artistsHasMore: boolean
  /** Query/offset actually sent (or about to be sent). */
  artistsPendingQuery: string | undefined
  artistsPendingOffset: number
  artistsQueuedQuery: string | undefined
  artistsQueuedOffset: number | undefined
  artistsQueuedSource: string | undefined
  rootAlbums: MetadataBrowseAlbum[]
  rootAlbumsTotal: number | undefined
  rootAlbumsHasMore: boolean
  albumsPendingQuery: string | undefined
  albumsPendingOffset: number
  albumsQueuedQuery: string | undefined
  albumsQueuedOffset: number | undefined
  albumsQueuedSource: string | undefined
  artist: MetadataBrowseArtist | null
  albums: MetadataBrowseAlbum[]
  album: MetadataBrowseAlbum | null
  mediaKey: string | null
  mediaName: string | null
  tracks: MetadataSourceTrackWithSource[]
  error: RequestError | null
  artistInFlightSource: string | undefined
  artistInFlightId: string | undefined
  artistQueuedSource: string | undefined
  artistQueuedId: string | undefined
  albumInFlightSource: string | undefined
  albumInFlightId: string | undefined
  albumQueuedSource: string | undefined
  albumQueuedId: string | undefined
  mediaInFlightKey: string | undefined
  mediaQueuedKey: string | undefined
}

/** SERVER_EVENT allowlist for `useSocketMachine` (ADR 0093) — keep in sync with `CatalogBrowseEvent`. */
export const CATALOG_BROWSE_EVENT_TYPES = [
  "BROWSE_ARTISTS_RESULTS",
  "BROWSE_ARTISTS_FAILURE",
  "BROWSE_ALBUMS_RESULTS",
  "BROWSE_ALBUMS_FAILURE",
  "BROWSE_ARTIST_RESULTS",
  "BROWSE_ARTIST_FAILURE",
  "BROWSE_ALBUM_RESULTS",
  "BROWSE_ALBUM_FAILURE",
  "BROWSE_MEDIA_ITEM_RESULTS",
  "BROWSE_MEDIA_ITEM_FAILURE",
]

type CatalogBrowseEvent =
  | { type: "FETCH_ARTISTS"; source: string; query?: string; offset?: number; limit?: number }
  | { type: "FETCH_ALBUMS"; source: string; query?: string; offset?: number; limit?: number }
  | { type: "FETCH_ARTIST"; source: string; artistId: string }
  | { type: "FETCH_ALBUM"; source: string; albumId: string }
  | { type: "FETCH_MEDIA"; mediaKey: string }
  | {
      type: "BROWSE_ARTISTS_RESULTS"
      data: {
        source: string
        items: MetadataBrowseArtist[]
        total?: number
        query?: string
        offset?: number
      }
    }
  | { type: "BROWSE_ARTISTS_FAILURE"; data: RequestError }
  | {
      type: "BROWSE_ALBUMS_RESULTS"
      data: {
        source: string
        items: MetadataBrowseAlbum[]
        total?: number
        query?: string
        offset?: number
      }
    }
  | { type: "BROWSE_ALBUMS_FAILURE"; data: RequestError }
  | {
      type: "BROWSE_ARTIST_RESULTS"
      data: {
        source: string
        artist: MetadataBrowseArtist
        albums: MetadataBrowseAlbum[]
      }
    }
  | { type: "BROWSE_ARTIST_FAILURE"; data: RequestError }
  | {
      type: "BROWSE_ALBUM_RESULTS"
      data: {
        source: string
        album: MetadataBrowseAlbum
        tracks: MetadataSourceTrackWithSource[]
      }
    }
  | { type: "BROWSE_ALBUM_FAILURE"; data: RequestError }
  | {
      type: "BROWSE_MEDIA_ITEM_RESULTS"
      data: {
        source: string
        mediaKey: string
        name: string
        tracks: MetadataSourceTrackWithSource[]
      }
    }
  | { type: "BROWSE_MEDIA_ITEM_FAILURE"; data: RequestError }

export const catalogBrowseMachine = setup({
  types: {
    context: {} as CatalogBrowseContext,
    events: {} as CatalogBrowseEvent,
  },
  guards: {
    hasCachedAlbum: ({ event }) => {
      if (event.type !== "FETCH_ALBUM") return false
      const entry = getSessionCache(albumSessionCacheKey(event.source, event.albumId))
      return entry?.kind === "album"
    },
    hasCachedMedia: ({ event }) => {
      if (event.type !== "FETCH_MEDIA") return false
      const entry = getSessionCache(mediaSessionCacheKey(event.mediaKey))
      return entry?.kind === "media"
    },
    isArtistsFirstPage: ({ event }) =>
      event.type === "FETCH_ARTISTS" && (event.offset ?? 0) === 0,
    isArtistsLoadMore: ({ event }) => event.type === "FETCH_ARTISTS" && (event.offset ?? 0) > 0,
    isAlbumsFirstPage: ({ event }) =>
      event.type === "FETCH_ALBUMS" && (event.offset ?? 0) === 0,
    isAlbumsLoadMore: ({ event }) => event.type === "FETCH_ALBUMS" && (event.offset ?? 0) > 0,
    hasQueuedArtists: ({ context }) => context.artistsQueuedOffset !== undefined,
    hasQueuedAlbums: ({ context }) => context.albumsQueuedOffset !== undefined,
    hasQueuedArtist: ({ context }) => context.artistQueuedId !== undefined,
    hasQueuedAlbum: ({ context }) => context.albumQueuedId !== undefined,
    hasQueuedMedia: ({ context }) => context.mediaQueuedKey !== undefined,
    artistsResultsMatchRequest: ({ context, event }) => {
      if (event.type !== "BROWSE_ARTISTS_RESULTS") return false
      if (event.data.source !== context.source) return false
      if (normalizeBrowseQuery(event.data.query) !== normalizeBrowseQuery(context.artistsPendingQuery)) {
        return false
      }
      return (event.data.offset ?? 0) === context.artistsPendingOffset
    },
    albumsResultsMatchRequest: ({ context, event }) => {
      if (event.type !== "BROWSE_ALBUMS_RESULTS") return false
      if (event.data.source !== context.source) return false
      if (normalizeBrowseQuery(event.data.query) !== normalizeBrowseQuery(context.albumsPendingQuery)) {
        return false
      }
      return (event.data.offset ?? 0) === context.albumsPendingOffset
    },
    artistResultsMatchRequest: ({ context, event }) => {
      if (event.type !== "BROWSE_ARTIST_RESULTS") return false
      if (event.data.source !== context.artistInFlightSource) return false
      return event.data.artist.id === context.artistInFlightId
    },
    albumResultsMatchRequest: ({ context, event }) => {
      if (event.type !== "BROWSE_ALBUM_RESULTS") return false
      if (event.data.source !== context.albumInFlightSource) return false
      return event.data.album.id === context.albumInFlightId
    },
    mediaResultsMatchRequest: ({ context, event }) => {
      if (event.type !== "BROWSE_MEDIA_ITEM_RESULTS") return false
      return event.data.mediaKey === context.mediaInFlightKey
    },
  },
  actions: {
    sendListArtists: ({ context }) => {
      if (!context.source) return
      emitToSocket("BROWSE_ARTISTS", {
        source: context.source,
        query: context.artistsPendingQuery,
        offset: context.artistsPendingOffset,
        limit: CATALOG_BROWSE_PAGE_SIZE,
      })
    },
    sendListAlbums: ({ context }) => {
      if (!context.source) return
      emitToSocket("BROWSE_ALBUMS", {
        source: context.source,
        query: context.albumsPendingQuery,
        offset: context.albumsPendingOffset,
        limit: CATALOG_BROWSE_PAGE_SIZE,
      })
    },
    stashArtistsRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ARTISTS") return {}
      const offset = event.offset ?? 0
      return {
        source: event.source,
        artistsPendingQuery: event.query,
        artistsPendingOffset: offset,
        artistsQueuedQuery: undefined,
        artistsQueuedOffset: undefined,
        artistsQueuedSource: undefined,
        ...(offset === 0
          ? { artists: [], artistsTotal: undefined, artistsHasMore: false }
          : {}),
      }
    }),
    queueArtistsRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ARTISTS") return {}
      return {
        artistsQueuedQuery: event.query,
        artistsQueuedOffset: event.offset ?? 0,
        artistsQueuedSource: event.source,
        artists: [],
        artistsTotal: undefined,
        artistsHasMore: false,
      }
    }),
    promoteArtistsQueued: assign(({ context }) => ({
      source: context.artistsQueuedSource ?? context.source,
      artistsPendingQuery: context.artistsQueuedQuery,
      artistsPendingOffset: context.artistsQueuedOffset ?? 0,
      artistsQueuedQuery: undefined,
      artistsQueuedOffset: undefined,
      artistsQueuedSource: undefined,
    })),
    clearArtistsQueue: assign({
      artistsQueuedQuery: undefined,
      artistsQueuedOffset: undefined,
      artistsQueuedSource: undefined,
    }),
    stashAlbumsRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ALBUMS") return {}
      const offset = event.offset ?? 0
      return {
        source: event.source,
        albumsPendingQuery: event.query,
        albumsPendingOffset: offset,
        albumsQueuedQuery: undefined,
        albumsQueuedOffset: undefined,
        albumsQueuedSource: undefined,
        ...(offset === 0
          ? { rootAlbums: [], rootAlbumsTotal: undefined, rootAlbumsHasMore: false }
          : {}),
      }
    }),
    queueAlbumsRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ALBUMS") return {}
      return {
        albumsQueuedQuery: event.query,
        albumsQueuedOffset: event.offset ?? 0,
        albumsQueuedSource: event.source,
        rootAlbums: [],
        rootAlbumsTotal: undefined,
        rootAlbumsHasMore: false,
      }
    }),
    promoteAlbumsQueued: assign(({ context }) => ({
      source: context.albumsQueuedSource ?? context.source,
      albumsPendingQuery: context.albumsQueuedQuery,
      albumsPendingOffset: context.albumsQueuedOffset ?? 0,
      albumsQueuedQuery: undefined,
      albumsQueuedOffset: undefined,
      albumsQueuedSource: undefined,
    })),
    clearAlbumsQueue: assign({
      albumsQueuedQuery: undefined,
      albumsQueuedOffset: undefined,
      albumsQueuedSource: undefined,
    }),
    sendGetArtist: ({ context }) => {
      if (!context.artistInFlightSource || !context.artistInFlightId) return
      emitToSocket("BROWSE_ARTIST", {
        source: context.artistInFlightSource,
        artistId: context.artistInFlightId,
      })
    },
    sendGetAlbum: ({ context }) => {
      if (!context.albumInFlightSource || !context.albumInFlightId) return
      emitToSocket("BROWSE_ALBUM", {
        source: context.albumInFlightSource,
        albumId: context.albumInFlightId,
      })
    },
    sendGetMedia: ({ context }) => {
      if (!context.mediaInFlightKey) return
      emitToSocket("BROWSE_MEDIA_ITEM", {
        mediaKey: context.mediaInFlightKey,
      })
    },
    stashArtistRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ARTIST") return {}
      return {
        artistInFlightSource: event.source,
        artistInFlightId: event.artistId,
        artistQueuedSource: undefined,
        artistQueuedId: undefined,
        artist: null,
        albums: [],
        album: null,
        tracks: [],
      }
    }),
    queueArtistRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ARTIST") return {}
      return {
        artistQueuedSource: event.source,
        artistQueuedId: event.artistId,
        artist: null,
        albums: [],
        album: null,
        tracks: [],
      }
    }),
    promoteArtistQueued: assign(({ context }) => ({
      artistInFlightSource: context.artistQueuedSource,
      artistInFlightId: context.artistQueuedId,
      artistQueuedSource: undefined,
      artistQueuedId: undefined,
    })),
    stashAlbumRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ALBUM") return {}
      return {
        albumInFlightSource: event.source,
        albumInFlightId: event.albumId,
        albumQueuedSource: undefined,
        albumQueuedId: undefined,
        album: null,
        tracks: [],
        mediaKey: null,
        mediaName: null,
      }
    }),
    queueAlbumRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ALBUM") return {}
      return {
        albumQueuedSource: event.source,
        albumQueuedId: event.albumId,
        album: null,
        tracks: [],
        mediaKey: null,
        mediaName: null,
      }
    }),
    promoteAlbumQueued: assign(({ context }) => ({
      albumInFlightSource: context.albumQueuedSource,
      albumInFlightId: context.albumQueuedId,
      albumQueuedSource: undefined,
      albumQueuedId: undefined,
    })),
    stashMediaRequest: assign(({ event }) => {
      if (event.type !== "FETCH_MEDIA") return {}
      return {
        mediaInFlightKey: event.mediaKey,
        mediaQueuedKey: undefined,
        mediaKey: null,
        mediaName: null,
        album: null,
        tracks: [],
      }
    }),
    queueMediaRequest: assign(({ event }) => {
      if (event.type !== "FETCH_MEDIA") return {}
      return {
        mediaQueuedKey: event.mediaKey,
        mediaKey: null,
        mediaName: null,
        album: null,
        tracks: [],
      }
    }),
    promoteMediaQueued: assign(({ context }) => ({
      mediaInFlightKey: context.mediaQueuedKey,
      mediaQueuedKey: undefined,
    })),
    applyCachedAlbum: assign(({ event }) => {
      if (event.type !== "FETCH_ALBUM") return {}
      const entry = getSessionCache(albumSessionCacheKey(event.source, event.albumId))
      if (entry?.kind !== "album") return {}
      return {
        source: entry.source,
        album: entry.album,
        tracks: entry.tracks,
        mediaKey: null,
        mediaName: null,
        error: null,
        albumInFlightSource: undefined,
        albumInFlightId: undefined,
        albumQueuedSource: undefined,
        albumQueuedId: undefined,
      }
    }),
    applyCachedMedia: assign(({ event }) => {
      if (event.type !== "FETCH_MEDIA") return {}
      const entry = getSessionCache(mediaSessionCacheKey(event.mediaKey))
      if (entry?.kind !== "media") return {}
      return {
        source: entry.source,
        mediaKey: entry.mediaKey,
        mediaName: entry.mediaName,
        album: null,
        tracks: entry.tracks,
        error: null,
        mediaInFlightKey: undefined,
        mediaQueuedKey: undefined,
      }
    }),
    setArtists: assign(({ context, event }) => {
      if (event.type !== "BROWSE_ARTISTS_RESULTS") return {}
      const incoming = event.data.items ?? []
      const offset = event.data.offset ?? context.artistsPendingOffset
      const previousLength = offset === 0 ? 0 : context.artists.length
      const artists = offset === 0 ? incoming : uniqueById([...context.artists, ...incoming])
      return {
        source: event.data.source,
        artists,
        artistsTotal: event.data.total,
        artistsHasMore: pageHasMore({
          accumulated: artists,
          incoming,
          previousLength,
          total: event.data.total,
          pageSize: CATALOG_BROWSE_PAGE_SIZE,
        }),
        error: null,
        artistsQueuedQuery: undefined,
        artistsQueuedOffset: undefined,
        artistsQueuedSource: undefined,
      }
    }),
    setRootAlbums: assign(({ context, event }) => {
      if (event.type !== "BROWSE_ALBUMS_RESULTS") return {}
      const incoming = event.data.items ?? []
      const offset = event.data.offset ?? context.albumsPendingOffset
      const previousLength = offset === 0 ? 0 : context.rootAlbums.length
      const rootAlbums = offset === 0 ? incoming : uniqueById([...context.rootAlbums, ...incoming])
      return {
        source: event.data.source,
        rootAlbums,
        rootAlbumsTotal: event.data.total,
        rootAlbumsHasMore: pageHasMore({
          accumulated: rootAlbums,
          incoming,
          previousLength,
          total: event.data.total,
          pageSize: CATALOG_BROWSE_PAGE_SIZE,
        }),
        error: null,
        albumsQueuedQuery: undefined,
        albumsQueuedOffset: undefined,
        albumsQueuedSource: undefined,
      }
    }),
    setArtist: assign(({ event }) => {
      if (event.type !== "BROWSE_ARTIST_RESULTS") return {}
      return {
        source: event.data.source,
        artist: event.data.artist,
        albums: event.data.albums ?? [],
        album: null,
        tracks: [],
        error: null,
        artistInFlightSource: undefined,
        artistInFlightId: undefined,
        artistQueuedSource: undefined,
        artistQueuedId: undefined,
      }
    }),
    setAlbum: assign(({ event }) => {
      if (event.type !== "BROWSE_ALBUM_RESULTS") return {}
      putSessionCache(albumSessionCacheKey(event.data.source, event.data.album.id), {
        kind: "album",
        source: event.data.source,
        album: event.data.album,
        tracks: event.data.tracks ?? [],
      })
      return {
        source: event.data.source,
        album: event.data.album,
        tracks: event.data.tracks ?? [],
        mediaKey: null,
        mediaName: null,
        error: null,
        albumInFlightSource: undefined,
        albumInFlightId: undefined,
        albumQueuedSource: undefined,
        albumQueuedId: undefined,
      }
    }),
    setMedia: assign(({ event }) => {
      if (event.type !== "BROWSE_MEDIA_ITEM_RESULTS") return {}
      putSessionCache(mediaSessionCacheKey(event.data.mediaKey), {
        kind: "media",
        source: event.data.source,
        mediaKey: event.data.mediaKey,
        mediaName: event.data.name,
        tracks: event.data.tracks ?? [],
      })
      return {
        source: event.data.source,
        mediaKey: event.data.mediaKey,
        mediaName: event.data.name,
        album: null,
        tracks: event.data.tracks ?? [],
        error: null,
        mediaInFlightKey: undefined,
        mediaQueuedKey: undefined,
      }
    }),
    setError: assign(({ event }) => {
      if (
        event.type !== "BROWSE_ARTISTS_FAILURE" &&
        event.type !== "BROWSE_ALBUMS_FAILURE" &&
        event.type !== "BROWSE_ARTIST_FAILURE" &&
        event.type !== "BROWSE_ALBUM_FAILURE" &&
        event.type !== "BROWSE_MEDIA_ITEM_FAILURE"
      ) {
        return {}
      }
      return { error: event.data }
    }),
    clearError: assign({ error: null }),
  },
}).createMachine({
  id: "catalog-browse",
  initial: "idle",
  context: {
    source: null,
    artists: [],
    artistsTotal: undefined,
    artistsHasMore: false,
    artistsPendingQuery: undefined,
    artistsPendingOffset: 0,
    artistsQueuedQuery: undefined,
    artistsQueuedOffset: undefined,
    artistsQueuedSource: undefined,
    rootAlbums: [],
    rootAlbumsTotal: undefined,
    rootAlbumsHasMore: false,
    albumsPendingQuery: undefined,
    albumsPendingOffset: 0,
    albumsQueuedQuery: undefined,
    albumsQueuedOffset: undefined,
    albumsQueuedSource: undefined,
    artist: null,
    albums: [],
    album: null,
    mediaKey: null,
    mediaName: null,
    tracks: [],
    error: null,
    artistInFlightSource: undefined,
    artistInFlightId: undefined,
    artistQueuedSource: undefined,
    artistQueuedId: undefined,
    albumInFlightSource: undefined,
    albumInFlightId: undefined,
    albumQueuedSource: undefined,
    albumQueuedId: undefined,
    mediaInFlightKey: undefined,
    mediaQueuedKey: undefined,
  },
  on: {
    FETCH_ARTISTS: [
      {
        guard: "isArtistsLoadMore",
        target: ".loadingMoreArtists",
        actions: ["clearError", "stashArtistsRequest"],
      },
      {
        target: ".loadingArtists",
        actions: ["clearError", "stashArtistsRequest"],
      },
    ],
    FETCH_ALBUMS: [
      {
        guard: "isAlbumsLoadMore",
        target: ".loadingMoreAlbums",
        actions: ["clearError", "stashAlbumsRequest"],
      },
      {
        target: ".loadingAlbums",
        actions: ["clearError", "stashAlbumsRequest"],
      },
    ],
    FETCH_ARTIST: {
      target: ".loadingArtist",
      actions: ["clearError", "stashArtistRequest"],
    },
    FETCH_ALBUM: [
      {
        guard: "hasCachedAlbum",
        target: ".idle",
        actions: ["clearError", "applyCachedAlbum"],
      },
      {
        target: ".loadingAlbum",
        actions: ["clearError", "stashAlbumRequest"],
      },
    ],
    FETCH_MEDIA: [
      {
        guard: "hasCachedMedia",
        target: ".idle",
        actions: ["clearError", "applyCachedMedia"],
      },
      {
        target: ".loadingMedia",
        actions: ["clearError", "stashMediaRequest"],
      },
    ],
  },
  states: {
    idle: {},
    failure: {},
    loadingArtists: {
      entry: ["sendListArtists"],
      on: {
        FETCH_ARTISTS: [
          {
            guard: "isArtistsFirstPage",
            actions: ["clearError", "queueArtistsRequest"],
          },
          {
            guard: "isArtistsLoadMore",
            target: "loadingArtists",
            reenter: false,
          },
        ],
        BROWSE_ARTISTS_RESULTS: [
          {
            guard: and(["hasQueuedArtists", "artistsResultsMatchRequest"]),
            target: "loadingArtists",
            reenter: true,
            actions: ["promoteArtistsQueued"],
          },
          {
            guard: "artistsResultsMatchRequest",
            target: "idle",
            actions: ["setArtists"],
          },
        ],
        BROWSE_ARTISTS_FAILURE: [
          {
            guard: "hasQueuedArtists",
            target: "loadingArtists",
            reenter: true,
            actions: ["promoteArtistsQueued"],
          },
          {
            target: "failure",
            actions: ["setError", "clearArtistsQueue"],
          },
        ],
      },
    },
    loadingMoreArtists: {
      entry: ["sendListArtists"],
      on: {
        FETCH_ARTISTS: [
          {
            guard: "isArtistsFirstPage",
            target: "loadingArtists",
            actions: ["clearError", "stashArtistsRequest"],
          },
          {
            guard: "isArtistsLoadMore",
            target: "loadingMoreArtists",
            reenter: false,
          },
        ],
        BROWSE_ARTISTS_RESULTS: [
          {
            guard: "artistsResultsMatchRequest",
            target: "idle",
            actions: ["setArtists"],
          },
        ],
        BROWSE_ARTISTS_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
    loadingAlbums: {
      entry: ["sendListAlbums"],
      on: {
        FETCH_ALBUMS: [
          {
            guard: "isAlbumsFirstPage",
            actions: ["clearError", "queueAlbumsRequest"],
          },
          {
            guard: "isAlbumsLoadMore",
            target: "loadingAlbums",
            reenter: false,
          },
        ],
        BROWSE_ALBUMS_RESULTS: [
          {
            guard: and(["hasQueuedAlbums", "albumsResultsMatchRequest"]),
            target: "loadingAlbums",
            reenter: true,
            actions: ["promoteAlbumsQueued"],
          },
          {
            guard: "albumsResultsMatchRequest",
            target: "idle",
            actions: ["setRootAlbums"],
          },
        ],
        BROWSE_ALBUMS_FAILURE: [
          {
            guard: "hasQueuedAlbums",
            target: "loadingAlbums",
            reenter: true,
            actions: ["promoteAlbumsQueued"],
          },
          {
            target: "failure",
            actions: ["setError", "clearAlbumsQueue"],
          },
        ],
      },
    },
    loadingMoreAlbums: {
      entry: ["sendListAlbums"],
      on: {
        FETCH_ALBUMS: [
          {
            guard: "isAlbumsFirstPage",
            target: "loadingAlbums",
            actions: ["clearError", "stashAlbumsRequest"],
          },
          {
            guard: "isAlbumsLoadMore",
            target: "loadingMoreAlbums",
            reenter: false,
          },
        ],
        BROWSE_ALBUMS_RESULTS: [
          {
            guard: "albumsResultsMatchRequest",
            target: "idle",
            actions: ["setRootAlbums"],
          },
        ],
        BROWSE_ALBUMS_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
    loadingArtist: {
      entry: ["sendGetArtist"],
      on: {
        FETCH_ARTIST: {
          actions: ["clearError", "queueArtistRequest"],
        },
        BROWSE_ARTIST_RESULTS: [
          {
            guard: and(["hasQueuedArtist", "artistResultsMatchRequest"]),
            target: "loadingArtist",
            reenter: true,
            actions: ["promoteArtistQueued"],
          },
          {
            guard: "artistResultsMatchRequest",
            target: "idle",
            actions: ["setArtist"],
          },
        ],
        BROWSE_ARTIST_FAILURE: [
          {
            guard: "hasQueuedArtist",
            target: "loadingArtist",
            reenter: true,
            actions: ["promoteArtistQueued"],
          },
          {
            target: "failure",
            actions: ["setError"],
          },
        ],
      },
    },
    loadingAlbum: {
      entry: ["sendGetAlbum"],
      on: {
        FETCH_ALBUM: [
          {
            guard: "hasCachedAlbum",
            target: "idle",
            actions: ["clearError", "applyCachedAlbum"],
          },
          {
            actions: ["clearError", "queueAlbumRequest"],
          },
        ],
        BROWSE_ALBUM_RESULTS: [
          {
            guard: and(["hasQueuedAlbum", "albumResultsMatchRequest"]),
            target: "loadingAlbum",
            reenter: true,
            actions: ["promoteAlbumQueued"],
          },
          {
            guard: "albumResultsMatchRequest",
            target: "idle",
            actions: ["setAlbum"],
          },
        ],
        BROWSE_ALBUM_FAILURE: [
          {
            guard: "hasQueuedAlbum",
            target: "loadingAlbum",
            reenter: true,
            actions: ["promoteAlbumQueued"],
          },
          {
            target: "failure",
            actions: ["setError"],
          },
        ],
      },
    },
    loadingMedia: {
      entry: ["sendGetMedia"],
      on: {
        FETCH_MEDIA: [
          {
            guard: "hasCachedMedia",
            target: "idle",
            actions: ["clearError", "applyCachedMedia"],
          },
          {
            actions: ["clearError", "queueMediaRequest"],
          },
        ],
        BROWSE_MEDIA_ITEM_RESULTS: [
          {
            guard: and(["hasQueuedMedia", "mediaResultsMatchRequest"]),
            target: "loadingMedia",
            reenter: true,
            actions: ["promoteMediaQueued"],
          },
          {
            guard: "mediaResultsMatchRequest",
            target: "idle",
            actions: ["setMedia"],
          },
        ],
        BROWSE_MEDIA_ITEM_FAILURE: [
          {
            guard: "hasQueuedMedia",
            target: "loadingMedia",
            reenter: true,
            actions: ["promoteMediaQueued"],
          },
          {
            target: "failure",
            actions: ["setError"],
          },
        ],
      },
    },
  },
})
