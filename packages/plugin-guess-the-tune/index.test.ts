import { describe, it, expect } from "vitest"
import { messageMatchesTarget, stripMetadataSuffixes } from "./matching"
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

  it("matches core title when catalog has hyphen remaster/year suffix", () => {
    expect(messageMatchesTarget("Yesterday", "Yesterday - Remastered 2009", 0.55)).toBe(true)
    expect(messageMatchesTarget("come together", "Come Together - 2019 Mix", 0.55)).toBe(true)
  })

  it("matches core title when hyphen suffix has year plus stereo/mono remaster wording", () => {
    expect(
      messageMatchesTarget("Picture Book", "Picture Book - 2018 Stereo Remaster", 0.55),
    ).toBe(true)
    expect(stripMetadataSuffixes("Picture Book - 2018 Stereo Remaster")).toBe("Picture Book")
  })

  it("matches core title when catalog has parenthetical remaster/edition", () => {
    expect(
      messageMatchesTarget("Bohemian Rhapsody", "Bohemian Rhapsody (2011 Remaster)", 0.55),
    ).toBe(true)
    expect(
      messageMatchesTarget(
        "Hotel California",
        "Hotel California (2013 Remaster)",
        0.55,
      ),
    ).toBe(true)
    expect(
      messageMatchesTarget(
        "Purple Rain",
        "Purple Rain (Deluxe Edition)",
        0.55,
      ),
    ).toBe(true)
    expect(
      messageMatchesTarget(
        "Song Title",
        "Song Title (2008 Remastered LP Version)",
        0.55,
      ),
    ).toBe(true)
  })

  it("matches when stripping live/radio-edit style suffixes", () => {
    expect(messageMatchesTarget("Stairway to Heaven", "Stairway to Heaven - Live", 0.55)).toBe(
      true,
    )
    expect(
      messageMatchesTarget(
        "Wonderwall",
        "Wonderwall - Radio Edit",
        0.55,
      ),
    ).toBe(true)
  })

  it("matches after stripping multiple suffix segments", () => {
    expect(
      messageMatchesTarget(
        "Song Title",
        "Song Title (Live) - Remastered 2009",
        0.55,
      ),
    ).toBe(true)
  })

  it("does not strip unrelated trailing parentheses (matching still needs those words)", () => {
    const title = "Heart Skips a Beat (When You Walk By)"
    expect(stripMetadataSuffixes(title)).toBe(title)
    expect(messageMatchesTarget("Heart Skips a Beat", title, 0.55)).toBe(false)
    expect(
      messageMatchesTarget("Heart Skips a Beat When You Walk By", title, 0.55),
    ).toBe(true)
    expect(messageMatchesTarget("Heart Skips", title, 0.55)).toBe(false)
  })
})

describe("stripMetadataSuffixes", () => {
  it("removes hyphen remaster and year variants", () => {
    expect(stripMetadataSuffixes("Yesterday - Remastered 2009")).toBe("Yesterday")
    expect(stripMetadataSuffixes("Track - 1977 Remaster")).toBe("Track")
    expect(stripMetadataSuffixes("Come Together - 2019 Mix")).toBe("Come Together")
  })

  it("removes parenthetical metadata", () => {
    expect(stripMetadataSuffixes("Foo (2011 Remaster)")).toBe("Foo")
    expect(stripMetadataSuffixes("Foo (Remastered 2009)")).toBe("Foo")
    expect(stripMetadataSuffixes("Album (Super Deluxe)")).toBe("Album")
    expect(stripMetadataSuffixes("Title (feat. Someone)")).toBe("Title")
  })

  it("iterates until stable for combined suffixes", () => {
    expect(stripMetadataSuffixes("Song (Live) - Remastered 2009")).toBe("Song")
    expect(stripMetadataSuffixes("Bar (2011 Remaster) - Deluxe Edition")).toBe("Bar")
  })

  it("leaves creative titles unchanged when suffix is not catalog metadata", () => {
    expect(stripMetadataSuffixes("Heart Skips a Beat (When You Walk By)")).toBe(
      "Heart Skips a Beat (When You Walk By)",
    )
    expect(stripMetadataSuffixes("Nothing Else Matters")).toBe("Nothing Else Matters")
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
