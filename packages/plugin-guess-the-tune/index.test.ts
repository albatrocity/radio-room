import { describe, it, expect } from "vitest"
import { messageMatchesTarget } from "./matching"
import { propsInPlay } from "./index"
import { defaultGuessTheTuneConfig } from "./types"

describe("messageMatchesTarget", () => {
  it("matches exact substring", () => {
    expect(messageMatchesTarget("I love Pink Floyd", "Pink Floyd", 0.5)).toBe(true)
  })

  it("matches fuzzy when each target word appears in the message", () => {
    expect(messageMatchesTarget("pink floyed?", "Pink Floyd", 0.55)).toBe(true)
  })

  it("rejects unrelated text", () => {
    expect(messageMatchesTarget("hello world", "Metallica", 0.35)).toBe(false)
  })

  it("does not match a single word from a long title", () => {
    expect(
      messageMatchesTarget("how", "How Music Makes You Feel Better", 0.45),
    ).toBe(false)
  })

  it("matches when every title word is represented (with per-word typos)", () => {
    expect(
      messageMatchesTarget(
        "How music makes u feel better",
        "How Music Makes You Feel Better",
        0.55,
      ),
    ).toBe(true)
  })

  it("does not match a tiny fragment against a one-word title", () => {
    expect(messageMatchesTarget("ch", "charlie", 0.55)).toBe(false)
  })

  it("matches a one-word title when the guess is long enough to be a real attempt", () => {
    expect(messageMatchesTarget("charlie", "charlie", 0.55)).toBe(true)
    expect(messageMatchesTarget("charl", "charlie", 0.55)).toBe(true)
  })
})

describe("propsInPlay", () => {
  const base = { ...defaultGuessTheTuneConfig }

  it("returns only fields that are enabled and non-empty", () => {
    expect(
      propsInPlay(
        { ...base, matchTitle: true, matchArtist: false, matchAlbum: true },
        { title: "  x  ", artist: "A", album: "" },
      ),
    ).toEqual(["title"])
  })

  it("returns title artist album in stable order when all apply", () => {
    expect(
      propsInPlay(
        { ...base, matchTitle: true, matchArtist: true, matchAlbum: true },
        { title: "T", artist: "A", album: "L" },
      ),
    ).toEqual(["title", "artist", "album"])
  })
})
