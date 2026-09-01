import { describe, it, expect } from "vitest"
import type { QueueItem } from "@repo/types/Queue"
import {
  buildPlayedTrackIdSet,
  buildQueuedTrackIdSet,
  getTrackRoomPresence,
} from "./trackRoomPresence"

function queueItem(trackId: string): QueueItem {
  return {
    title: "Test",
    track: {
      id: trackId,
      title: "Test",
      urls: [],
      artists: [],
      album: {
        id: "a1",
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
    },
    mediaSource: { type: "spotify", trackId },
    addedAt: Date.now(),
  }
}

describe("trackRoomPresence", () => {
  it("returns empty presence for empty sets", () => {
    const queued = buildQueuedTrackIdSet([])
    const played = buildPlayedTrackIdSet([])
    expect(getTrackRoomPresence("t1", queued, played)).toEqual({
      inQueue: false,
      alreadyPlayed: false,
    })
  })

  it("detects queue-only presence", () => {
    const queued = buildQueuedTrackIdSet([queueItem("t1")])
    const played = buildPlayedTrackIdSet([])
    expect(getTrackRoomPresence("t1", queued, played)).toEqual({
      inQueue: true,
      alreadyPlayed: false,
    })
  })

  it("detects playlist-only presence", () => {
    const queued = buildQueuedTrackIdSet([])
    const played = buildPlayedTrackIdSet([queueItem("t2")])
    expect(getTrackRoomPresence("t2", queued, played)).toEqual({
      inQueue: false,
      alreadyPlayed: true,
    })
  })

  it("detects both queue and playlist presence", () => {
    const queued = buildQueuedTrackIdSet([queueItem("t3")])
    const played = buildPlayedTrackIdSet([queueItem("t3")])
    expect(getTrackRoomPresence("t3", queued, played)).toEqual({
      inQueue: true,
      alreadyPlayed: true,
    })
  })
})
