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
