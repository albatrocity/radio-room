import { describe, it, expect } from "vitest"
import { guessTheTuneNowPlayingItemContext } from "./guessTheTunePluginItemContext"

describe("guessTheTuneNowPlayingItemContext", () => {
  it("returns undefined when guess-the-tune has no elementProps", () => {
    expect(guessTheTuneNowPlayingItemContext(undefined)).toBeUndefined()
    expect(guessTheTuneNowPlayingItemContext({})).toBeUndefined()
    expect(guessTheTuneNowPlayingItemContext({ "guess-the-tune": {} })).toBeUndefined()
  })

  it("reflects room-level global obscured state", () => {
    const ctx = guessTheTuneNowPlayingItemContext({
      "guess-the-tune": {
        elementProps: {
          title: { obscured: true },
          artist: { obscured: false, revealedBy: { userId: "admin", username: "Admin", at: 1 } },
          album: { obscured: true },
        },
      },
    })

    expect(ctx).toEqual({
      titleObscured: true,
      artistObscured: false,
      albumObscured: true,
      anyObscured: true,
    })
  })

  it("anyObscured is false when all present fields are globally revealed", () => {
    const ctx = guessTheTuneNowPlayingItemContext({
      "guess-the-tune": {
        elementProps: {
          title: { obscured: false },
          artist: { obscured: false },
        },
      },
    })

    expect(ctx?.anyObscured).toBe(false)
  })
})
