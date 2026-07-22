import { describe, expect, it } from "vitest"
import {
  collectPublicUrlCandidates,
  DEFAULT_PUBLIC_URL_TAG_PRIORITY,
  isValidPublicHttpUrl,
  pickPublicUrl,
  type PublicUrlCandidates,
} from "./publicUrlTags"

describe("isValidPublicHttpUrl", () => {
  it("accepts public https URLs", () => {
    expect(isValidPublicHttpUrl("https://artist.bandcamp.com/track/foo")).toBe(true)
    expect(isValidPublicHttpUrl("http://example.com/x")).toBe(true)
  })

  it("rejects non-http and private hosts", () => {
    expect(isValidPublicHttpUrl("local:abc")).toBe(false)
    expect(isValidPublicHttpUrl("file:///Music/a.mp3")).toBe(false)
    expect(isValidPublicHttpUrl("https://localhost/x")).toBe(false)
    expect(isValidPublicHttpUrl("https://127.0.0.1/x")).toBe(false)
    expect(isValidPublicHttpUrl("https://192.168.1.5/x")).toBe(false)
    expect(isValidPublicHttpUrl("not a url")).toBe(false)
  })
})

describe("pickPublicUrl", () => {
  const candidates: PublicUrlCandidates = {
    wcom: "https://shop.example/buy",
    woar: "https://artist.example",
    musicbrainz: "https://musicbrainz.org/recording/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  }

  it("uses default purchase-oriented order", () => {
    expect(pickPublicUrl(candidates)).toBe("https://shop.example/buy")
    expect(pickPublicUrl(candidates, DEFAULT_PUBLIC_URL_TAG_PRIORITY)).toBe(
      "https://shop.example/buy",
    )
  })

  it("respects woar-first override", () => {
    expect(
      pickPublicUrl(candidates, [
        "woar",
        "website",
        "wcom",
        "wpay",
        "woaf",
        "woas",
        "wxxx",
        "purchaseurl",
        "bandcamp",
        "url",
        "comment",
        "musicbrainz",
      ]),
    ).toBe("https://artist.example")
  })

  it("skips invalid candidate values", () => {
    expect(
      pickPublicUrl({
        wcom: "https://127.0.0.1/private",
        woar: "https://artist.example",
      }),
    ).toBe("https://artist.example")
  })

  it("returns undefined when nothing valid", () => {
    expect(pickPublicUrl({ wcom: "local:1" })).toBeUndefined()
  })
})

describe("collectPublicUrlCandidates", () => {
  it("maps OpenSubsonic comment URL and MusicBrainz id", () => {
    const out = collectPublicUrlCandidates({
      comment: "https://artist.bandcamp.com/album/demo",
      musicBrainzId: "189002e7-3285-4e2e-92a3-7f6c30d407a2",
    })
    expect(out.comment).toBe("https://artist.bandcamp.com/album/demo")
    expect(out.musicbrainz).toBe(
      "https://musicbrainz.org/recording/189002e7-3285-4e2e-92a3-7f6c30d407a2",
    )
  })

  it("ignores non-URL comments", () => {
    const out = collectPublicUrlCandidates({ comment: "Recorded live in 2019" })
    expect(out.comment).toBeUndefined()
  })
})
