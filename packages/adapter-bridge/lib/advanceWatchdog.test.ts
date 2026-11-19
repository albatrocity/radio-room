import { describe, expect, it, beforeEach } from "vitest"
import {
  PLAY_START_GRACE_MS,
  clearPlayTrackStart,
  getPendingNowPlaying,
  getPlayTrackStart,
  recordPlayTrackStart,
  resetPendingNowPlayingForTests,
  resetPlayTrackStartsForTests,
  setPendingNowPlaying,
  shouldCountStuckNoMedia,
  shouldHoldForUserPause,
  shouldIgnoreEndedForPlayStart,
  takePendingNowPlayingIfPlaying,
} from "./advanceWatchdog"

describe("advanceWatchdog", () => {
  beforeEach(() => {
    resetPlayTrackStartsForTests()
    resetPendingNowPlayingForTests()
  })

  it("ignores ENDED for the track that was left by a commanded play", () => {
    recordPlayTrackStart("r1", {
      leftTrackId: "spotify:track:old",
      dispatchedTrackId: "spotify:track:new",
    })
    expect(
      shouldIgnoreEndedForPlayStart({
        endedTrackId: "old",
        start: getPlayTrackStart("r1"),
      }),
    ).toBe(true)
  })

  it("ignores ENDED whose id is not the dispatched track", () => {
    recordPlayTrackStart("r1", {
      leftTrackId: "a",
      dispatchedTrackId: "b",
    })
    expect(
      shouldIgnoreEndedForPlayStart({
        endedTrackId: "c",
        start: getPlayTrackStart("r1"),
      }),
    ).toBe(true)
  })

  it("allows ENDED for the dispatched track", () => {
    recordPlayTrackStart("r1", {
      leftTrackId: "a",
      dispatchedTrackId: "spotify:track:b",
    })
    expect(
      shouldIgnoreEndedForPlayStart({
        endedTrackId: "b",
        start: getPlayTrackStart("r1"),
      }),
    ).toBe(false)
  })

  it("holds while a user pause is recorded", () => {
    expect(shouldHoldForUserPause(true)).toBe(true)
    expect(shouldHoldForUserPause(false)).toBe(false)
  })

  it("does not count stuck polls during the startup grace", () => {
    const at = Date.now()
    recordPlayTrackStart("r1", { leftTrackId: null, dispatchedTrackId: "t1", at })
    expect(
      shouldCountStuckNoMedia({
        userPause: false,
        start: getPlayTrackStart("r1"),
        now: at + 1_000,
      }),
    ).toBe(false)
    expect(
      shouldCountStuckNoMedia({
        userPause: false,
        start: getPlayTrackStart("r1"),
        now: at + PLAY_START_GRACE_MS,
      }),
    ).toBe(true)
  })

  it("never counts stuck polls while the user pause is held", () => {
    expect(
      shouldCountStuckNoMedia({
        userPause: true,
        start: null,
        now: Date.now(),
      }),
    ).toBe(false)
  })

  it("posts pending now-playing only when the commanded track is playing with media", () => {
    setPendingNowPlaying("r1", {
      trackId: "spotify:track:abc",
      title: "Song",
      artist: "Artist",
    })
    expect(
      takePendingNowPlayingIfPlaying({
        roomId: "r1",
        trackId: "abc",
        state: "paused",
        hasPlayableMedia: true,
      }),
    ).toBeNull()
    expect(getPendingNowPlaying("r1")).not.toBeNull()

    const taken = takePendingNowPlayingIfPlaying({
      roomId: "r1",
      trackId: "abc",
      state: "playing",
      hasPlayableMedia: true,
    })
    expect(taken).toEqual({
      trackId: "abc",
      title: "Song",
      artist: "Artist",
    })
    expect(getPendingNowPlaying("r1")).toBeNull()
    expect(getPlayTrackStart("r1")).toBeNull()
  })

  it("clears a start command explicitly", () => {
    recordPlayTrackStart("r1", { leftTrackId: "a", dispatchedTrackId: "b" })
    clearPlayTrackStart("r1")
    expect(getPlayTrackStart("r1")).toBeNull()
  })
})
