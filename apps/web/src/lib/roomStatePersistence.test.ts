import { describe, expect, it } from "vitest"
import type { QueueItem } from "../types/Queue"
import {
  capTail,
  compactPersistedRoomState,
  isQuotaExceededError,
  slimQueueItemForPersist,
  type PersistedRoomState,
} from "./roomStatePersistence"

function image(id: string): { type: "image"; url: string; id: string } {
  return { type: "image", url: `https://img.example/${id}.jpg`, id }
}

function fatQueueItem(): QueueItem {
  const album = {
    id: "alb",
    title: "Album",
    urls: [image("a1"), image("a2"), image("a3")],
    artists: [
      { id: "ar", title: "Artist", urls: [image("ar1"), image("ar2")] },
    ],
    releaseDate: "2020-01-01",
    releaseDatePrecision: "day" as const,
    totalTracks: 10,
    label: "Label",
    images: [image("ai1"), image("ai2"), image("ai3")],
  }
  const track = {
    id: "t1",
    title: "Song",
    urls: [image("t1"), image("t2")],
    artists: [{ id: "ar", title: "Artist", urls: [image("ar1"), image("ar2")] }],
    album,
    duration: 180,
    explicit: false,
    trackNumber: 1,
    discNumber: 1,
    popularity: 50,
    images: [image("ti1"), image("ti2")],
  }
  return {
    title: "Song",
    track,
    mediaSource: { type: "spotify", trackId: "sp1" },
    metadataSource: { type: "spotify", trackId: "sp1" },
    metadataSources: {
      spotify: { source: { type: "spotify", trackId: "sp1" }, track },
      tidal: { source: { type: "tidal", trackId: "td1" }, track: { ...track, id: "td1" } },
      youtube: { source: { type: "youtube", trackId: "yt1" }, track: { ...track, id: "yt1" } },
    },
    pluginData: { skipVotes: { a: true, b: true } },
    addedAt: 1,
    addedBy: { userId: "u1", username: "ross" },
    addedDuring: "seg",
    playedAt: 2,
  }
}

function persisted(overrides?: Partial<PersistedRoomState["contexts"]>): PersistedRoomState {
  return {
    roomId: "r1",
    timestamp: 1,
    contexts: {
      chat: {
        messages: Array.from({ length: 80 }, (_, i) => ({
          content: `msg ${i}`,
          timestamp: String(i),
          user: { userId: "u", username: "n" },
        })),
      },
      playlist: { playlist: Array.from({ length: 120 }, fatQueueItem) },
      users: { users: [{ userId: "u" }] },
      reactions: { reactions: { message: { m1: [{ type: "👍", id: "1", user: "u" }] }, track: {} } },
      settings: {
        title: "Room",
        fetchMeta: true,
        extraInfo: "",
        deputizeOnJoin: false,
        enableSpotifyLogin: false,
        type: "jukebox",
        radioMetaUrl: "",
        radioListenUrl: "",
        announceUsernameChanges: true,
        announceNowPlaying: true,
        pluginConfigs: {},
      },
      audio: { volume: 0.5 },
      ...overrides,
    },
  }
}

describe("slimQueueItemForPersist", () => {
  it("drops duplicate metadata sources and extra artwork URLs", () => {
    const slim = slimQueueItemForPersist(fatQueueItem())
    expect(slim.metadataSources).toBeUndefined()
    expect(slim.pluginData).toBeUndefined()
    expect(slim.track.images).toHaveLength(1)
    expect(slim.track.album.images).toHaveLength(1)
    expect(slim.track.album.artists[0]?.urls).toHaveLength(1)
    expect(slim.mediaSource).toEqual({ type: "spotify", trackId: "sp1" })
  })

  it("is much smaller than a multi-source catalog row", () => {
    const fat = fatQueueItem()
    const slim = slimQueueItemForPersist(fat)
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(fat).length / 2)
  })
})

describe("capTail", () => {
  it("keeps the most recent items", () => {
    expect(capTail([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5])
  })
})

describe("compactPersistedRoomState", () => {
  it("shrinks chat, playlist, and reactions for a quota retry", () => {
    const compact = compactPersistedRoomState(persisted())
    expect(compact.contexts.chat.messages).toHaveLength(40)
    expect(compact.contexts.playlist.playlist).toHaveLength(80)
    expect(compact.contexts.reactions.reactions).toEqual({ message: {}, track: {} })
  })
})

describe("isQuotaExceededError", () => {
  it("recognizes QuotaExceededError", () => {
    expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(true)
    expect(isQuotaExceededError(new Error("nope"))).toBe(false)
  })
})
