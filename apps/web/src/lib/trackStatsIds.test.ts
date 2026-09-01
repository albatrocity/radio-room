import { describe, it, expect } from "vitest"
import type { QueueItem } from "@repo/types/Queue"
import { trackStatsIdsFromQueueItem } from "./trackStatsIds"

function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    title: "Test",
    track: { id: "t1", title: "Test", urls: [], artists: [], album: { id: "a1", title: "Album", urls: [], artists: [], releaseDate: "", releaseDatePrecision: "year", totalTracks: 1, label: "", images: [] }, duration: 180000, explicit: false, trackNumber: 1, discNumber: 1, popularity: 0, images: [] },
    mediaSource: { type: "spotify", trackId: "spotify:track:abc" },
    addedAt: Date.now(),
    ...overrides,
  }
}

describe("trackStatsIdsFromQueueItem", () => {
  it("returns media source pair", () => {
    expect(trackStatsIdsFromQueueItem(queueItem())).toEqual({
      mediaSourceType: "spotify",
      mediaSourceTrackId: "spotify:track:abc",
    })
  })

  it("includes spotify and tidal ids from metadataSources", () => {
    const item = queueItem({
      mediaSource: { type: "local", trackId: "nd-1" },
      metadataSources: {
        spotify: {
          source: { type: "spotify", trackId: "spotify:track:xyz" },
          track: { id: "spotify:track:xyz", title: "X", urls: [], artists: [], album: { id: "a", title: "A", urls: [], artists: [], releaseDate: "", releaseDatePrecision: "year", totalTracks: 1, label: "", images: [] }, duration: 1, explicit: false, trackNumber: 1, discNumber: 1, popularity: 0, images: [] },
        },
        tidal: {
          source: { type: "tidal", trackId: "12345" },
          track: { id: "12345", title: "Y", urls: [], artists: [], album: { id: "b", title: "B", urls: [], artists: [], releaseDate: "", releaseDatePrecision: "year", totalTracks: 1, label: "", images: [] }, duration: 1, explicit: false, trackNumber: 1, discNumber: 1, popularity: 0, images: [] },
        },
      },
    })
    expect(trackStatsIdsFromQueueItem(item)).toEqual({
      mediaSourceType: "local",
      mediaSourceTrackId: "nd-1",
      spotifyTrackId: "spotify:track:xyz",
      tidalTrackId: "12345",
    })
  })

  it("returns null when media source missing", () => {
    expect(trackStatsIdsFromQueueItem(queueItem({ mediaSource: undefined as unknown as QueueItem["mediaSource"] }))).toBeNull()
  })
})
