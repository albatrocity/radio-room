import { describe, expect, it, vi, beforeEach } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))

import { emitToSocket } from "../actors/socketActor"
import { mediaItemTracksMachine, type MediaItemTrack } from "./mediaItemTracksMachine"

function track(id: string): MediaItemTrack {
  return {
    id,
    title: `Track ${id}`,
    duration: 180000,
    artists: [{ id: "a1", title: "Artist" }],
    album: { id: "al1", title: "Album", images: [] },
    source: "local",
  } as MediaItemTrack
}

describe("mediaItemTracksMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requests tracks on FETCH and stores the results", () => {
    const actor = createActor(mediaItemTracksMachine).start()
    actor.send({ type: "FETCH", mediaKey: "pm-1" })

    expect(emitToSocket).toHaveBeenCalledWith("LIST_MEDIA_ITEM_TRACKS", { mediaKey: "pm-1" })
    expect(actor.getSnapshot().matches("loading")).toBe(true)

    actor.send({
      type: "LIST_MEDIA_ITEM_TRACKS_RESULTS",
      data: { mediaKey: "pm-1", name: "LP: Loveless", tracks: [track("t1")] },
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches("loaded")).toBe(true)
    expect(snapshot.context.name).toBe("LP: Loveless")
    expect(snapshot.context.tracks).toHaveLength(1)
    expect(snapshot.context.error).toBeNull()
    actor.stop()
  })

  it("stores the failure message and clears tracks", () => {
    const actor = createActor(mediaItemTracksMachine).start()
    actor.send({ type: "FETCH", mediaKey: "pm-1" })
    actor.send({
      type: "LIST_MEDIA_ITEM_TRACKS_FAILURE",
      data: { message: "Media Bridge is not connected." },
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches("failure")).toBe(true)
    expect(snapshot.context.error).toBe("Media Bridge is not connected.")
    expect(snapshot.context.tracks).toEqual([])
    actor.stop()
  })

  it("ignores results for a media item the viewer navigated away from", () => {
    const actor = createActor(mediaItemTracksMachine).start()
    actor.send({ type: "FETCH", mediaKey: "pm-1" })
    actor.send({ type: "FETCH", mediaKey: "pm-2" })

    actor.send({
      type: "LIST_MEDIA_ITEM_TRACKS_RESULTS",
      data: { mediaKey: "pm-1", name: "Stale", tracks: [track("stale")] },
    })
    expect(actor.getSnapshot().matches("loading")).toBe(true)
    expect(actor.getSnapshot().context.tracks).toEqual([])

    actor.send({
      type: "LIST_MEDIA_ITEM_TRACKS_RESULTS",
      data: { mediaKey: "pm-2", name: "Current", tracks: [track("t2")] },
    })
    expect(actor.getSnapshot().context.name).toBe("Current")
    actor.stop()
  })

  it("clears state on RESET", () => {
    const actor = createActor(mediaItemTracksMachine).start()
    actor.send({ type: "FETCH", mediaKey: "pm-1" })
    actor.send({
      type: "LIST_MEDIA_ITEM_TRACKS_RESULTS",
      data: { mediaKey: "pm-1", name: "LP", tracks: [track("t1")] },
    })

    actor.send({ type: "RESET" })
    const snapshot = actor.getSnapshot()
    expect(snapshot.matches("idle")).toBe(true)
    expect(snapshot.context).toEqual({ mediaKey: null, name: null, tracks: [], error: null })
    actor.stop()
  })
})
