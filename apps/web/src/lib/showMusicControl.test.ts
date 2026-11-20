import { describe, expect, it } from "vitest"
import { getShowMusicControl } from "./showMusicControl"

describe("getShowMusicControl", () => {
  it("pauses while playing", () => {
    expect(
      getShowMusicControl({
        transport: "playing",
        canResume: true,
        queueLength: 3,
        pending: false,
      }),
    ).toMatchObject({
      mode: "pause",
      showPauseIcon: true,
      disabled: false,
    })
  })

  it("resumes when a user pause can continue", () => {
    expect(
      getShowMusicControl({
        transport: "paused",
        canResume: true,
        queueLength: 2,
        pending: false,
      }),
    ).toMatchObject({
      mode: "resume",
      tooltip: "Resume show music",
      disabled: false,
    })
  })

  it("starts the next track when nothing is resumable", () => {
    expect(
      getShowMusicControl({
        transport: "stopped",
        canResume: false,
        queueLength: 1,
        pending: false,
      }),
    ).toMatchObject({
      mode: "startNext",
      tooltip: "Start the next queued track",
    })
  })

  it("disables when the queue is empty and nothing is resumable", () => {
    expect(
      getShowMusicControl({
        transport: null,
        canResume: false,
        queueLength: 0,
        pending: false,
      }),
    ).toMatchObject({
      mode: "idleEmpty",
      disabled: true,
    })
  })

  it("disables while a toggle is pending", () => {
    expect(
      getShowMusicControl({
        transport: "playing",
        canResume: true,
        queueLength: 0,
        pending: true,
      }).disabled,
    ).toBe(true)
  })
})
