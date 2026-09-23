import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"
import type {
  MetadataBrowseAlbum,
  MetadataSourceTrackWithSource,
} from "@repo/types"
import {
  catalogBrowseMachine,
  clearCatalogBrowseSessionCache,
} from "./catalogBrowseMachine"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))

import { emitToSocket } from "../actors/socketActor"

function album(id: string): MetadataBrowseAlbum {
  return {
    id,
    title: `Album ${id}`,
    artists: [{ id: "a1", title: "Artist", urls: [] }],
    images: [],
  }
}

function track(id: string): MetadataSourceTrackWithSource {
  return {
    id,
    title: `Track ${id}`,
    urls: [],
    artists: [{ id: "a1", title: "Artist", urls: [] }],
    album: {
      id: "al1",
      title: "Album",
      urls: [],
      artists: [],
      releaseDate: "",
      releaseDatePrecision: "year",
      totalTracks: 1,
      label: "",
      images: [],
    },
    duration: 180000,
    explicit: false,
    trackNumber: 1,
    discNumber: 1,
    popularity: 0,
    images: [],
    source: "local",
  }
}

describe("catalogBrowseMachine session cache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCatalogBrowseSessionCache()
  })

  it("emits BROWSE_ALBUM on first FETCH_ALBUM and skips emit on repeat", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_ALBUM", source: "local", albumId: "alb-1" })

    expect(emitToSocket).toHaveBeenCalledWith("BROWSE_ALBUM", {
      source: "local",
      albumId: "alb-1",
    })
    expect(actor.getSnapshot().matches("loadingAlbum")).toBe(true)

    actor.send({
      type: "BROWSE_ALBUM_RESULTS",
      data: {
        source: "local",
        album: album("alb-1"),
        tracks: [track("t1")],
      },
    })
    expect(actor.getSnapshot().context.tracks).toHaveLength(1)

    vi.mocked(emitToSocket).mockClear()
    actor.send({ type: "FETCH_ALBUM", source: "local", albumId: "alb-1" })

    expect(emitToSocket).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.album?.id).toBe("alb-1")
    expect(actor.getSnapshot().context.tracks).toHaveLength(1)
    actor.stop()
  })

  it("emits BROWSE_MEDIA_ITEM on first FETCH_MEDIA and skips emit on repeat", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_MEDIA", mediaKey: "pm-1" })

    expect(emitToSocket).toHaveBeenCalledWith("BROWSE_MEDIA_ITEM", { mediaKey: "pm-1" })

    actor.send({
      type: "BROWSE_MEDIA_ITEM_RESULTS",
      data: {
        source: "local",
        mediaKey: "pm-1",
        name: "LP",
        tracks: [track("t1")],
      },
    })

    vi.mocked(emitToSocket).mockClear()
    actor.send({ type: "FETCH_MEDIA", mediaKey: "pm-1" })

    expect(emitToSocket).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.mediaKey).toBe("pm-1")
    expect(actor.getSnapshot().context.mediaName).toBe("LP")
    expect(actor.getSnapshot().context.tracks).toHaveLength(1)
    actor.stop()
  })
})

describe("catalogBrowseMachine artist/album paging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCatalogBrowseSessionCache()
  })

  it("replaces artists on offset 0 and appends on later pages", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_ARTISTS", source: "local", offset: 0, limit: 50 })

    expect(emitToSocket).toHaveBeenCalledWith("BROWSE_ARTISTS", {
      source: "local",
      query: undefined,
      offset: 0,
      limit: 50,
    })

    actor.send({
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: "local",
        items: [{ id: "a1", title: "A" }],
        total: 2,
        offset: 0,
      },
    })
    expect(actor.getSnapshot().context.artists.map((a) => a.id)).toEqual(["a1"])
    expect(actor.getSnapshot().context.artistsHasMore).toBe(true)

    actor.send({ type: "FETCH_ARTISTS", source: "local", offset: 1, limit: 50 })
    expect(actor.getSnapshot().matches("loadingMoreArtists")).toBe(true)
    expect(actor.getSnapshot().context.artists).toHaveLength(1)

    actor.send({
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: "local",
        items: [{ id: "a2", title: "B" }],
        total: 2,
        offset: 1,
      },
    })
    expect(actor.getSnapshot().context.artists.map((a) => a.id)).toEqual(["a1", "a2"])
    expect(actor.getSnapshot().context.artistsHasMore).toBe(false)
    actor.stop()
  })

  it("does not emit a second FETCH while loadingMore artists", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_ARTISTS", source: "local", offset: 0, limit: 50 })
    actor.send({
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: "local",
        items: [{ id: "a1", title: "A" }],
        total: 100,
        offset: 0,
      },
    })

    actor.send({ type: "FETCH_ARTISTS", source: "local", offset: 1, limit: 50 })
    vi.mocked(emitToSocket).mockClear()
    actor.send({ type: "FETCH_ARTISTS", source: "local", offset: 1, limit: 50 })
    expect(emitToSocket).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches("loadingMoreArtists")).toBe(true)
    actor.stop()
  })
})

describe("catalogBrowseMachine request queue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCatalogBrowseSessionCache()
  })

  it("queues a refined artists filter while loading and applies only the latest", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({
      type: "FETCH_ARTISTS",
      source: "spotify",
      query: "radio",
      offset: 0,
      limit: 50,
    })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(emitToSocket).toHaveBeenCalledWith("BROWSE_ARTISTS", {
      source: "spotify",
      query: "radio",
      offset: 0,
      limit: 50,
    })

    actor.send({
      type: "FETCH_ARTISTS",
      source: "spotify",
      query: "radiohead",
      offset: 0,
      limit: 50,
    })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().context.artists).toEqual([])
    expect(actor.getSnapshot().context.artistsQueuedQuery).toBe("radiohead")

    actor.send({
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: "spotify",
        query: "radio",
        offset: 0,
        items: [{ id: "stale", title: "Radio" }],
        total: 1,
      },
    })
    expect(actor.getSnapshot().matches("loadingArtists")).toBe(true)
    expect(actor.getSnapshot().context.artists).toEqual([])
    expect(emitToSocket).toHaveBeenCalledTimes(2)
    expect(emitToSocket).toHaveBeenLastCalledWith("BROWSE_ARTISTS", {
      source: "spotify",
      query: "radiohead",
      offset: 0,
      limit: 50,
    })

    actor.send({
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: "spotify",
        query: "radiohead",
        offset: 0,
        items: [{ id: "fresh", title: "Radiohead" }],
        total: 1,
      },
    })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.artists.map((a) => a.id)).toEqual(["fresh"])
    actor.stop()
  })

  it("queues a refined albums filter while loading and applies only the latest", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({
      type: "FETCH_ALBUMS",
      source: "spotify",
      query: "ok",
      offset: 0,
      limit: 50,
    })
    actor.send({
      type: "FETCH_ALBUMS",
      source: "spotify",
      query: "ok computer",
      offset: 0,
      limit: 50,
    })
    expect(emitToSocket).toHaveBeenCalledTimes(1)

    actor.send({
      type: "BROWSE_ALBUMS_RESULTS",
      data: {
        source: "spotify",
        query: "ok",
        offset: 0,
        items: [album("stale")],
        total: 1,
      },
    })
    expect(emitToSocket).toHaveBeenCalledTimes(2)
    expect(actor.getSnapshot().context.rootAlbums).toEqual([])

    actor.send({
      type: "BROWSE_ALBUMS_RESULTS",
      data: {
        source: "spotify",
        query: "ok computer",
        offset: 0,
        items: [album("fresh")],
        total: 1,
      },
    })
    expect(actor.getSnapshot().context.rootAlbums.map((a) => a.id)).toEqual(["fresh"])
    actor.stop()
  })

  it("ignores a mismatched artists response and stays loading", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({
      type: "FETCH_ARTISTS",
      source: "spotify",
      query: "radiohead",
      offset: 0,
      limit: 50,
    })
    actor.send({
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: "spotify",
        query: "radio",
        offset: 0,
        items: [{ id: "stale", title: "Radio" }],
        total: 1,
      },
    })
    expect(actor.getSnapshot().matches("loadingArtists")).toBe(true)
    expect(actor.getSnapshot().context.artists).toEqual([])
    actor.stop()
  })

  it("queues album B while A is in flight and only keeps B's tracks", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_ALBUM", source: "local", albumId: "alb-a" })
    expect(emitToSocket).toHaveBeenCalledWith("BROWSE_ALBUM", {
      source: "local",
      albumId: "alb-a",
    })

    actor.send({ type: "FETCH_ALBUM", source: "local", albumId: "alb-b" })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().context.tracks).toEqual([])
    expect(actor.getSnapshot().context.album).toBeNull()
    expect(actor.getSnapshot().context.albumQueuedId).toBe("alb-b")

    actor.send({
      type: "BROWSE_ALBUM_RESULTS",
      data: {
        source: "local",
        album: album("alb-a"),
        tracks: [track("t-a")],
      },
    })
    expect(actor.getSnapshot().matches("loadingAlbum")).toBe(true)
    expect(actor.getSnapshot().context.tracks).toEqual([])
    expect(emitToSocket).toHaveBeenCalledTimes(2)
    expect(emitToSocket).toHaveBeenLastCalledWith("BROWSE_ALBUM", {
      source: "local",
      albumId: "alb-b",
    })

    actor.send({
      type: "BROWSE_ALBUM_RESULTS",
      data: {
        source: "local",
        album: album("alb-b"),
        tracks: [track("t-b")],
      },
    })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.album?.id).toBe("alb-b")
    expect(actor.getSnapshot().context.tracks.map((t) => t.id)).toEqual(["t-b"])
    actor.stop()
  })

  it("queues artist B while A is in flight and only keeps B", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_ARTIST", source: "local", artistId: "art-a" })
    actor.send({ type: "FETCH_ARTIST", source: "local", artistId: "art-b" })
    expect(emitToSocket).toHaveBeenCalledTimes(1)

    actor.send({
      type: "BROWSE_ARTIST_RESULTS",
      data: {
        source: "local",
        artist: { id: "art-a", title: "A", urls: [], images: [] },
        albums: [album("alb-a")],
      },
    })
    expect(emitToSocket).toHaveBeenCalledTimes(2)
    expect(actor.getSnapshot().context.artist).toBeNull()

    actor.send({
      type: "BROWSE_ARTIST_RESULTS",
      data: {
        source: "local",
        artist: { id: "art-b", title: "B", urls: [], images: [] },
        albums: [album("alb-b")],
      },
    })
    expect(actor.getSnapshot().context.artist?.id).toBe("art-b")
    expect(actor.getSnapshot().context.albums.map((a) => a.id)).toEqual(["alb-b"])
    actor.stop()
  })

  it("queues media B while A is in flight and only keeps B's tracks", () => {
    const actor = createActor(catalogBrowseMachine).start()
    actor.send({ type: "FETCH_MEDIA", mediaKey: "pm-a" })
    actor.send({ type: "FETCH_MEDIA", mediaKey: "pm-b" })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().context.tracks).toEqual([])

    actor.send({
      type: "BROWSE_MEDIA_ITEM_RESULTS",
      data: {
        source: "local",
        mediaKey: "pm-a",
        name: "A",
        tracks: [track("t-a")],
      },
    })
    expect(emitToSocket).toHaveBeenCalledTimes(2)
    expect(emitToSocket).toHaveBeenLastCalledWith("BROWSE_MEDIA_ITEM", { mediaKey: "pm-b" })

    actor.send({
      type: "BROWSE_MEDIA_ITEM_RESULTS",
      data: {
        source: "local",
        mediaKey: "pm-b",
        name: "B",
        tracks: [track("t-b")],
      },
    })
    expect(actor.getSnapshot().context.mediaKey).toBe("pm-b")
    expect(actor.getSnapshot().context.tracks.map((t) => t.id)).toEqual(["t-b"])
    actor.stop()
  })
})
