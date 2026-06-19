import { describe, it, expect, vi, beforeEach } from "vitest"
import { roomFactory } from "@repo/factories/room"
import { createTrackAdvanceJob } from "./trackAdvanceJob"

const popNextFromQueue = vi.fn()
const findRoom = vi.fn()
const handlePlaybackStateChange = vi.fn()

vi.mock("@repo/server/operations/data", () => ({
  findRoom: (...args: unknown[]) => findRoom(...args),
  addToQueue: vi.fn(),
  clearDispatchedTrack: vi.fn(),
  popNextFromQueue: (...args: unknown[]) => popNextFromQueue(...args),
  getDispatchedTrack: vi.fn().mockResolvedValue(null),
  setDispatchedTrack: vi.fn(),
  getQueueWithDispatched: vi.fn(),
}))

vi.mock("@repo/server/operations/playback/handlePlaybackStateChange", () => ({
  handlePlaybackStateChange: (...args: unknown[]) => handlePlaybackStateChange(...args),
  playbackStateFromIsPlaying: (isPlaying: boolean) => (isPlaying ? "playing" : "paused"),
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

describe("createTrackAdvanceJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SPOTIFY_CLIENT_ID = "test-client-id"
    findRoom.mockResolvedValue(
      roomFactory.build({
        id: "room1",
        playbackMode: "app-controlled",
        queueAutoAdvance: false,
      }),
    )
    getPlaybackState.mockResolvedValue({
      is_playing: true,
      progress_ms: 179_000,
      item: { id: "track1", duration_ms: 180_000 },
    })
  })

  it("does not pop the queue when queueAutoAdvance is disabled", async () => {
    const job = createTrackAdvanceJob({
      context: {
        data: {
          getUserServiceAuth: vi.fn().mockResolvedValue({
            accessToken: "token",
            refreshToken: "refresh",
          }),
        },
      } as never,
      roomId: "room1",
      userId: "user1",
      playTrack: vi.fn(),
    })

    await job.handler({ api: {} as never, context: {} as never })

    expect(handlePlaybackStateChange).toHaveBeenCalled()
    expect(popNextFromQueue).not.toHaveBeenCalled()
  })
})
