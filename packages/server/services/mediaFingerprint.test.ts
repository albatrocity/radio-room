import { describe, expect, it } from "vitest"
import { metadataSourceTrackFactory } from "@repo/factories"
import {
  MEDIA_KEY_VERSION,
  coverIdentityHash,
  coverObjectKey,
  fingerprintTrack,
  hashCoverBytes,
  normalizeMediaToken,
  previewObjectKey,
  previewPointerKey,
} from "./mediaFingerprint"

describe("normalizeMediaToken", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeMediaToken("  The Beatles!!! ")).toBe("the beatles")
    expect(normalizeMediaToken("Foo-Bar_Baz")).toBe("foo bar baz")
  })
})

describe("fingerprintTrack", () => {
  it("hashes equal for differently cased / punctuated metadata", () => {
    const a = metadataSourceTrackFactory.build({
      title: "Song Title!",
      artists: [{ title: "Artist Name" }],
      album: { title: "Album", images: [] },
      duration: 181_400,
      discNumber: 1,
      trackNumber: 3,
    })
    const b = metadataSourceTrackFactory.build({
      title: "song title",
      artists: [{ title: "artist  name" }],
      album: { title: "album...", images: [] },
      // Same whole-second after Math.round(ms/1000); stay clear of .5 boundaries
      duration: 181_450,
      discNumber: 1,
      trackNumber: 3,
    })
    expect(fingerprintTrack(a)).toBe(fingerprintTrack(b))
    expect(fingerprintTrack(a)).toMatch(/^[a-f0-9]{64}$/)
  })

  it("rounds duration to the nearest second", () => {
    const base = {
      title: "Song",
      artists: [{ title: "Artist" }],
      album: { title: "Album", images: [] },
      discNumber: 1,
      trackNumber: 1,
    }
    const a = metadataSourceTrackFactory.build({ ...base, duration: 60_400 })
    const b = metadataSourceTrackFactory.build({ ...base, duration: 60_499 })
    expect(fingerprintTrack(a)).toBe(fingerprintTrack(b))
  })

  it("returns null when artist and album are both empty", () => {
    const track = metadataSourceTrackFactory.build({
      title: "Untitled",
      artists: [{ title: "" }],
      album: { title: "", images: [] },
      duration: 60_000,
    })
    expect(fingerprintTrack(track)).toBeNull()
  })

  it("returns null when title is empty", () => {
    const track = metadataSourceTrackFactory.build({
      title: "",
      artists: [{ title: "A" }],
      album: { title: "B", images: [] },
      duration: 60_000,
    })
    expect(fingerprintTrack(track)).toBeNull()
  })
})

describe("hashCoverBytes / keys", () => {
  it("uses full sha256 and versioned key paths", () => {
    const hash = hashCoverBytes(Buffer.from("jpeg-bytes"))
    expect(hash).toHaveLength(64)
    expect(coverObjectKey(hash, "sm")).toBe(`media/covers/${MEDIA_KEY_VERSION}/${hash}/sm.jpg`)
    expect(previewObjectKey(hash)).toBe(`media/previews/${MEDIA_KEY_VERSION}/${hash}.mp3`)
    expect(previewPointerKey(hash)).toBe(`media:ptr:${MEDIA_KEY_VERSION}:preview:${hash}`)
  })

  it("cover identity is stable across punctuation", () => {
    expect(
      coverIdentityHash({ kind: "album", artist: "Artist!", album: "Record Name" }),
    ).toBe(coverIdentityHash({ kind: "album", artist: "artist", album: "record name" }))
  })
})
