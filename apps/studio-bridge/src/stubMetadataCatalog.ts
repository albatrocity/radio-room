/**
 * Stub metadata catalog for Game Studio → web Add-to-Queue / CatalogBrowse.
 * Not real Spotify/local data — keeps preview sockets from hanging (ADR 0089 / 0090).
 */

import type {
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataBrowseCapabilities,
  MetadataSourceTrack,
  PhysicalMediaItem,
} from "@repo/types"

export const STUB_METADATA_SOURCE_IDS = ["spotify", "local"] as const

export const STUB_BROWSEABLE_SOURCE_IDS = ["local"] as const

/** Inline cover art so the preview works offline, no image store required. */
export const STUB_MEDIA_ARTWORK =
  "data:image/svg+xml;utf8," +
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>" +
  "<rect width='64' height='64' fill='%23412a5b'/>" +
  "<circle cx='32' cy='32' r='22' fill='%23111111'/>" +
  "<circle cx='32' cy='32' r='5' fill='%23e8d6ff'/></svg>"

export const STUB_MY_MEDIA: PhysicalMediaItem[] = [
  {
    mediaKey: "pm-studio-lp",
    name: "LP: Studio Pressing",
    icon: "Disc3",
    imageUrl: STUB_MEDIA_ARTWORK,
    artworkFrame: "record-jacket",
  },
  {
    mediaKey: "pm-studio-cd",
    name: "CD: Studio Album",
    icon: "Disc",
    imageUrl: STUB_MEDIA_ARTWORK,
    artworkFrame: "jewel-case",
  },
  {
    mediaKey: "pm-studio-45",
    name: "45: Studio Single",
    icon: "DiscAlbum",
    imageUrl: STUB_MEDIA_ARTWORK,
    artworkFrame: "die-cut-jacket",
  },
  {
    mediaKey: "pm-studio-tape",
    name: "Cassette: Studio Demo",
    icon: "CassetteTape",
    imageUrl: STUB_MEDIA_ARTWORK,
    artworkFrame: "cassette-case",
  },
]

export const STUB_BROWSE_SOURCE_CAPABILITIES: Record<string, MetadataBrowseCapabilities> = {
  local: { entryMode: "index", albumSearch: true },
}

const stubArtist: MetadataBrowseArtist = {
  id: "studio-artist-1",
  title: "Studio Artist",
  albumCount: 1,
}

const stubAlbum: MetadataBrowseAlbum = {
  id: "studio-album-1",
  title: "Studio Album",
  artists: [{ id: stubArtist.id, title: stubArtist.title, urls: [] }],
  year: "2024",
  trackCount: 2,
}

function stubTrack(id: string, title: string, trackNumber: number): MetadataSourceTrack {
  return {
    id,
    title,
    urls: [],
    artists: [{ id: stubArtist.id, title: stubArtist.title, urls: [] }],
    album: {
      id: stubAlbum.id,
      title: stubAlbum.title,
      urls: [],
      artists: [{ id: stubArtist.id, title: stubArtist.title, urls: [] }],
      releaseDate: "2024-01-01",
      releaseDatePrecision: "day",
      totalTracks: 2,
      label: "Game Studio",
      images: [],
    },
    duration: 180_000,
    explicit: false,
    trackNumber,
    discNumber: 1,
    popularity: 0,
    images: [],
  }
}

const stubTracks: MetadataSourceTrack[] = [
  stubTrack("studio-track-1", "Stub Track One", 1),
  stubTrack("studio-track-2", "Stub Track Two", 2),
]

export function buildEffectiveMetadataSourcesEvent() {
  return {
    type: "EFFECTIVE_METADATA_SOURCES" as const,
    data: {
      metadataSourceIds: [...STUB_METADATA_SOURCE_IDS],
      browseableSourceIds: [...STUB_BROWSEABLE_SOURCE_IDS],
      browseSourceCapabilities: STUB_BROWSE_SOURCE_CAPABILITIES,
      myMedia: STUB_MY_MEDIA,
    },
  }
}

export function stubBrowseArtists(query?: string) {
  const q = query?.trim().toLowerCase()
  const items = q
    ? [stubArtist].filter((a) => a.title.toLowerCase().includes(q))
    : [stubArtist]
  return {
    type: "BROWSE_ARTISTS_RESULTS" as const,
    data: { source: "local", items, total: items.length },
  }
}

export function stubBrowseAlbums(query?: string) {
  const q = query?.trim().toLowerCase()
  const items = q
    ? [stubAlbum].filter((a) => a.title.toLowerCase().includes(q))
    : [stubAlbum]
  return {
    type: "BROWSE_ALBUMS_RESULTS" as const,
    data: { source: "local", items, total: items.length },
  }
}

export function stubBrowseArtist(artistId: string) {
  if (artistId !== stubArtist.id) {
    return {
      type: "BROWSE_ARTIST_FAILURE" as const,
      data: { message: "Artist not found (studio-bridge stub)" },
    }
  }
  return {
    type: "BROWSE_ARTIST_RESULTS" as const,
    data: { source: "local", artist: stubArtist, albums: [stubAlbum] },
  }
}

export function stubBrowseAlbum(albumId: string) {
  if (albumId !== stubAlbum.id) {
    return {
      type: "BROWSE_ALBUM_FAILURE" as const,
      data: { message: "Album not found (studio-bridge stub)" },
    }
  }
  const tracks = stubTracks.map((t) => ({ ...t, source: "local" }))
  return {
    type: "BROWSE_ALBUM_RESULTS" as const,
    data: { source: "local", album: stubAlbum, tracks },
  }
}

export function stubBrowseMediaItem(mediaKey: string) {
  const match = STUB_MY_MEDIA.find((s) => s.mediaKey === mediaKey)
  if (!match) {
    return {
      type: "BROWSE_MEDIA_ITEM_FAILURE" as const,
      data: { message: "You don't have that item" },
    }
  }
  const tracks = stubTracks.map((t) => ({ ...t, source: "local" }))
  return {
    type: "BROWSE_MEDIA_ITEM_RESULTS" as const,
    data: { source: "local", mediaKey: match.mediaKey, name: match.name, tracks },
  }
}

/** Minimal SEARCH_TRACK response so Add-to-Queue search mode does not hang. */
export function stubSearchTracks(query: string) {
  const q = query.trim().toLowerCase()
  const items = stubTracks
    .filter((t) => !q || t.title.toLowerCase().includes(q))
    .map((t) => ({ ...t, source: "spotify" }))
  return {
    type: "TRACK_SEARCH_RESULTS" as const,
    data: {
      items,
      total: items.length,
      offset: 0,
      limit: 20,
      artists: q.length >= 2 ? [{ ...stubArtist, source: "local" }] : [],
      albums: q.length >= 2 ? [{ ...stubAlbum, source: "local" }] : [],
    },
  }
}

export function requireBrowseableSource(source: string): string | null {
  if (source === "local") return null
  return "Metadata source does not support browse (studio-bridge stub: only local)"
}
