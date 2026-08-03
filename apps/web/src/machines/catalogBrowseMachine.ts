import { assign, setup } from "xstate"
import type {
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataSourceTrack,
} from "@repo/types"
import { emitToSocket } from "../actors/socketActor"

type RequestError = {
  message: string
  error?: unknown
}

export interface CatalogBrowseContext {
  source: string | null
  artists: MetadataBrowseArtist[]
  artistsTotal: number | undefined
  artist: MetadataBrowseArtist | null
  albums: MetadataBrowseAlbum[]
  album: MetadataBrowseAlbum | null
  tracks: (MetadataSourceTrack & { source?: string })[]
  error: RequestError | null
}

type CatalogBrowseEvent =
  | { type: "FETCH_ARTISTS"; source: string; query?: string }
  | { type: "FETCH_ARTIST"; source: string; artistId: string }
  | { type: "FETCH_ALBUM"; source: string; albumId: string }
  | {
      type: "BROWSE_ARTISTS_RESULTS"
      data: { source: string; items: MetadataBrowseArtist[]; total?: number }
    }
  | { type: "BROWSE_ARTISTS_FAILURE"; data: RequestError }
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
        tracks: (MetadataSourceTrack & { source?: string })[]
      }
    }
  | { type: "BROWSE_ALBUM_FAILURE"; data: RequestError }

export const catalogBrowseMachine = setup({
  types: {
    context: {} as CatalogBrowseContext,
    events: {} as CatalogBrowseEvent,
  },
  actions: {
    sendListArtists: ({ event }) => {
      if (event.type === "FETCH_ARTISTS") {
        emitToSocket("BROWSE_ARTISTS", {
          source: event.source,
          query: event.query,
        })
      }
    },
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
    setArtists: assign(({ event }) => {
      if (event.type !== "BROWSE_ARTISTS_RESULTS") return {}
      return {
        source: event.data.source,
        artists: event.data.items ?? [],
        artistsTotal: event.data.total,
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
      return {
        source: event.data.source,
        album: event.data.album,
        tracks: event.data.tracks ?? [],
        error: null,
      }
    }),
    setError: assign(({ event }) => {
      if (
        event.type !== "BROWSE_ARTISTS_FAILURE" &&
        event.type !== "BROWSE_ARTIST_FAILURE" &&
        event.type !== "BROWSE_ALBUM_FAILURE"
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
    artist: null,
    albums: [],
    album: null,
    tracks: [],
    error: null,
  },
  on: {
    FETCH_ARTISTS: {
      target: ".loadingArtists",
      actions: ["clearError"],
    },
    FETCH_ARTIST: {
      target: ".loadingArtist",
      actions: ["clearError"],
    },
    FETCH_ALBUM: {
      target: ".loadingAlbum",
      actions: ["clearError"],
    },
  },
  states: {
    idle: {},
    failure: {},
    loadingArtists: {
      entry: ["sendListArtists"],
      on: {
        BROWSE_ARTISTS_RESULTS: {
          target: "idle",
          actions: ["setArtists"],
        },
        BROWSE_ARTISTS_FAILURE: {
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
  },
})
