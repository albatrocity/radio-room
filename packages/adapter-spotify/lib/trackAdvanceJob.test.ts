import { describe, it, expect, vi, beforeEach } from "vitest"
import { roomFactory } from "@repo/factories/room"
import { createTrackAdvanceJob } from "./trackAdvanceJob"

const popNextFromQueue = vi.fn()
const findRoom = vi.fn()
const systemEventsEmit = vi.fn().mockResolvedValue(undefined)

vi.mock("@repo/server/operations/data", () => ({
  findRoom: (...args: unknown[]) => findRoom(...args),
  addToQueue: vi.fn(),
  buildQueueChangedData: vi.fn(),
  clearDispatchedTrack: vi.fn(),
  popNextFromQueue: (...args: unknown[]) => popNextFromQueue(...args),
  getDispatchedTrack: vi.fn().mockResolvedValue(null),
  setDispatchedTrack: vi.fn(),
  getQueueWithDispatched: vi.fn(),
}))

const getPlaybackState = vi.fn()

vi.mock("@spotify/web-api-ts-sdk", () => ({
  SpotifyApi: {
    withAccessToken: () => ({
      player: {
        getPlaybackState,
      },
    }),
  },
}))

function createTestContext() {
  const redisStore = new Map<string, string>()

  return {
    data: {
      getUserServiceAuth: vi.fn().mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
      }),
    },
    redis: {
      pubClient: {
        get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => {
          redisStore.set(key, value)
          return "OK"
        }),
      },
    },
    systemEvents: {
      emit: systemEventsEmit,
    },
  }
}

describe("createTrackAdvanceJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    systemEventsEmit.mockResolvedValue(undefined)
    process.env.SPOTIFY_CLIENT_ID = "test-client-id"
    findRoom.mockResolvedValue(
      roomFactory.build({
        id: "room1",
        type: "jukebox",
        playbackMode: "spotify-controlled",
      }),
    )
    getPlaybackState.mockResolvedValue({
      is_playing: true,
      progress_ms: 10_000,
      item: { id: "track1", duration_ms: 180_000 },
      device: { volume_percent: 65 },
    })
  })

  it("probes playback state and volume without advancing for spotify-controlled rooms", async () => {
    const context = createTestContext()

    const job = createTrackAdvanceJob({
      context: context as never,
      roomId: "room1",
      userId: "user1",
      playTrack: vi.fn(),
    })

    await job.handler({ api: {} as never, context: {} as never })

    expect(systemEventsEmit).toHaveBeenCalledWith(
      "room1",
      "PLAYBACK_STATE_CHANGED",
      expect.objectContaining({
        roomId: "room1",
        state: "playing",
        trackId: "track1",
      }),
    )
    expect(systemEventsEmit).toHaveBeenCalledWith(
      "room1",
      "PLAYBACK_VOLUME_CHANGED",
      expect.objectContaining({
        roomId: "room1",
        volumePercent: 65,
      }),
    )
    expect(popNextFromQueue).not.toHaveBeenCalled()
  })
})
