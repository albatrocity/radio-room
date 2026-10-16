import { describe, expect, it } from "vitest"
import type { QueueItem } from "@repo/types"
import { lobbyLogoArtworkUrl } from "./lobbyArtwork"

function trackItem(url: string, preferredUrl?: string): QueueItem {
  return {
    title: "Song",
    track: {
      id: "t1",
      title: "Song",
      artists: [],
      album: {
        id: "a1",
        title: "Album",
        artists: [],
        releaseDate: "",
        releaseDatePrecision: "day",
        totalTracks: 1,
        label: "",
        images: [{ type: "image", url, id: "300x300" }],
        urls: [],
      },
      duration: 1,
      explicit: false,
      trackNumber: 1,
      discNumber: 1,
      popularity: 0,
      images: [],
      urls: [],
    },
    mediaSource: { type: "shoutcast", trackId: "t1" },
    addedAt: 0,
    ...(preferredUrl
      ? {
          metadataSources: {
            tidal: {
              source: { type: "tidal", trackId: "tidal-1" },
              track: {
                id: "tidal-1",
                title: "Song",
                artists: [],
                album: {
                  id: "ta1",
                  title: "Album",
                  artists: [],
                  releaseDate: "",
                  releaseDatePrecision: "day" as const,
                  totalTracks: 1,
                  label: "",
                  images: [{ type: "image" as const, url: preferredUrl, id: "320x320" }],
                  urls: [],
                },
                duration: 1,
                explicit: false,
                trackNumber: 1,
                discNumber: 1,
                popularity: 0,
                images: [],
                urls: [],
              },
            },
          },
        }
      : {}),
  }
}

describe("lobbyLogoArtworkUrl", () => {
  it("uses the segment image in streaming mode", () => {
    expect(
      lobbyLogoArtworkUrl(
        {
          type: "radio",
          fetchMeta: false,
          artwork: "https://cdn/room.jpg",
          streamingArtwork: "https://cdn/segment.jpg",
          nowPlaying: trackItem("https://cdn/track.jpg"),
        },
        "spotify",
      ),
    ).toBe("https://cdn/segment.jpg")
  })

  it("falls back to room artwork when the segment has no image", () => {
    expect(
      lobbyLogoArtworkUrl({
        type: "live",
        fetchMeta: false,
        artwork: "https://cdn/room.jpg",
        streamingArtwork: null,
        nowPlaying: trackItem("https://cdn/track.jpg"),
      }),
    ).toBe("https://cdn/room.jpg")
  })

  it("uses room artwork when that is the streaming cover", () => {
    expect(
      lobbyLogoArtworkUrl({
        type: "radio",
        fetchMeta: false,
        artwork: "https://cdn/room.jpg",
        streamingArtwork: "https://cdn/room.jpg",
      }),
    ).toBe("https://cdn/room.jpg")
  })

  it("returns undefined in streaming mode with no segment or room image", () => {
    expect(
      lobbyLogoArtworkUrl({
        type: "radio",
        fetchMeta: false,
        artwork: "  ",
        streamingArtwork: "",
        nowPlaying: trackItem("https://cdn/track.jpg"),
      }),
    ).toBeUndefined()
  })

  it("keeps track artwork when track detection is on", () => {
    expect(
      lobbyLogoArtworkUrl({
        type: "radio",
        fetchMeta: true,
        artwork: "https://cdn/room.jpg",
        streamingArtwork: "https://cdn/segment.jpg",
        nowPlaying: trackItem("https://cdn/track.jpg"),
      }),
    ).toBe("https://cdn/track.jpg")
  })

  it("prefers the listener's metadata source for track art", () => {
    expect(
      lobbyLogoArtworkUrl(
        {
          type: "radio",
          fetchMeta: true,
          nowPlaying: trackItem("https://cdn/spotify.jpg", "https://cdn/tidal.jpg"),
        },
        "tidal",
      ),
    ).toBe("https://cdn/tidal.jpg")
  })

  it("does not treat a jukebox with track detection off as streaming", () => {
    expect(
      lobbyLogoArtworkUrl({
        type: "jukebox",
        fetchMeta: false,
        artwork: "https://cdn/room.jpg",
        streamingArtwork: "https://cdn/segment.jpg",
        nowPlaying: trackItem("https://cdn/track.jpg"),
      }),
    ).toBe("https://cdn/track.jpg")
  })

  it("returns undefined without a room or a track", () => {
    expect(lobbyLogoArtworkUrl(null)).toBeUndefined()
    expect(lobbyLogoArtworkUrl({ type: "radio", fetchMeta: true })).toBeUndefined()
  })
})
