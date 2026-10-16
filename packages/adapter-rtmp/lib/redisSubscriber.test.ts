import { describe, expect, it, vi } from "vitest"
import type { JobApi } from "@repo/types"
import { handleNowPlayingMessage } from "./redisSubscriber"

function api(): JobApi {
  return { submitMediaData: vi.fn(), getCurrentTrackId: vi.fn() }
}

describe("handleNowPlayingMessage", () => {
  it("submits the same track id join the subscriber always used", async () => {
    const job = api()
    await handleNowPlayingMessage(
      "room-1",
      job,
      JSON.stringify({ roomId: "room-1", title: "Song", artist: "A", album: "B" }),
    )
    expect(job.submitMediaData).toHaveBeenCalledWith({
      roomId: "room-1",
      submission: {
        trackId: "A-Song-B",
        sourceType: "rtmp",
        title: "Song",
        artist: "A",
        album: "B",
      },
    })
  })

  it("clears now playing when the title is empty", async () => {
    const job = api()
    await handleNowPlayingMessage("room-1", job, JSON.stringify({ roomId: "room-1", title: "" }))
    expect(job.submitMediaData).toHaveBeenCalledWith({ roomId: "room-1" })
  })

  it("ignores a publish for a different room", async () => {
    const job = api()
    await handleNowPlayingMessage(
      "room-1",
      job,
      JSON.stringify({ roomId: "other", title: "Song" }),
    )
    expect(job.submitMediaData).not.toHaveBeenCalled()
  })
})
