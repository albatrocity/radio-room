import { assign, setup } from "xstate"
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
  artistsPendingQuery: string | undefined
  artistsPendingOffset: number
  rootAlbums: MetadataBrowseAlbum[]
  rootAlbumsTotal: number | undefined
  rootAlbumsHasMore: boolean
  albumsPendingQuery: string | undefined
  albumsPendingOffset: number
  artist: MetadataBrowseArtist | null
  albums: MetadataBrowseAlbum[]
  album: MetadataBrowseAlbum | null
  mediaKey: string | null
  mediaName: string | null
  tracks: MetadataSourceTrackWithSource[]
  error: RequestError | null
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
  },
  actions: {
    sendListArtists: ({ event }) => {
      if (event.type === "FETCH_ARTISTS") {
        emitToSocket("BROWSE_ARTISTS", {
          source: event.source,
          query: event.query,
          offset: event.offset ?? 0,
          limit: event.limit ?? CATALOG_BROWSE_PAGE_SIZE,
        })
      }
    },
    sendListAlbums: ({ event }) => {
      if (event.type === "FETCH_ALBUMS") {
        emitToSocket("BROWSE_ALBUMS", {
          source: event.source,
          query: event.query,
          offset: event.offset ?? 0,
          limit: event.limit ?? CATALOG_BROWSE_PAGE_SIZE,
        })
      }
    },
    stashArtistsRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ARTISTS") return {}
      return {
        source: event.source,
        artistsPendingQuery: event.query,
        artistsPendingOffset: event.offset ?? 0,
      }
    }),
    stashAlbumsRequest: assign(({ event }) => {
      if (event.type !== "FETCH_ALBUMS") return {}
      return {
        source: event.source,
        albumsPendingQuery: event.query,
        albumsPendingOffset: event.offset ?? 0,
      }
    }),
    sendGetArtist: ({ event }) => {
      if (event.type === "FETCH_ARTIST") {
        emitToSocket("BROWSE_ARTIST", {
          source: event.source,
          artistId: event.artistId,
        })
      }
    },
    sendGetAlbum: ({ event }) => {
      if (event.type === "FETCH_ALBUM") {
        emitToSocket("BROWSE_ALBUM", {
          source: event.source,
          albumId: event.albumId,
        })
      }
    },
    sendGetMedia: ({ event }) => {
      if (event.type === "FETCH_MEDIA") {
        emitToSocket("BROWSE_MEDIA_ITEM", {
          mediaKey: event.mediaKey,
        })
      }
    },
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
    rootAlbums: [],
    rootAlbumsTotal: undefined,
    rootAlbumsHasMore: false,
    albumsPendingQuery: undefined,
    albumsPendingOffset: 0,
    artist: null,
    albums: [],
    album: null,
    mediaKey: null,
    mediaName: null,
    tracks: [],
    error: null,
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
      actions: ["clearError"],
    },
    FETCH_ALBUM: [
      {
        guard: "hasCachedAlbum",
        target: ".idle",
        actions: ["clearError", "applyCachedAlbum"],
      },
      {
        target: ".loadingAlbum",
        actions: ["clearError"],
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
        actions: ["clearError"],
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
            target: "loadingArtists",
            actions: ["clearError", "stashArtistsRequest"],
          },
          {
            guard: "isArtistsLoadMore",
            target: "loadingArtists",
            reenter: false,
          },
        ],
        BROWSE_ARTISTS_RESULTS: [
          {
            guard: "artistsResultsMatchRequest",
            target: "idle",
            actions: ["setArtists"],
          },
          { target: "idle" },
        ],
        BROWSE_ARTISTS_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
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
          { target: "idle" },
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
            target: "loadingAlbums",
            actions: ["clearError", "stashAlbumsRequest"],
          },
          {
            guard: "isAlbumsLoadMore",
            target: "loadingAlbums",
            reenter: false,
          },
        ],
        BROWSE_ALBUMS_RESULTS: [
          {
            guard: "albumsResultsMatchRequest",
            target: "idle",
            actions: ["setRootAlbums"],
          },
          { target: "idle" },
        ],
        BROWSE_ALBUMS_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
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
          { target: "idle" },
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
        BROWSE_ARTIST_RESULTS: {
          target: "idle",
          actions: ["setArtist"],
        },
        BROWSE_ARTIST_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
    loadingAlbum: {
      entry: ["sendGetAlbum"],
      on: {
        BROWSE_ALBUM_RESULTS: {
          target: "idle",
          actions: ["setAlbum"],
        },
        BROWSE_ALBUM_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
    loadingMedia: {
      entry: ["sendGetMedia"],
      on: {
        BROWSE_MEDIA_ITEM_RESULTS: {
          target: "idle",
          actions: ["setMedia"],
        },
        BROWSE_MEDIA_ITEM_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
  },
})
