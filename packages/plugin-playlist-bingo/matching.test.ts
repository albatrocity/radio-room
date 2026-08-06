import { describe, expect, it } from "vitest"
import { queueItemFactory } from "@repo/factories"
import { metadataSourceTrackFactory } from "@repo/factories"
import { userFactory } from "@repo/factories"
import { containsNormalized, matchesCriterion, parseReleaseYear } from "./matching"

describe("containsNormalized", () => {
  it("matches case-insensitive substrings", () => {
    expect(containsNormalized("Nirvana", "nirvana")).toBe(true)
    expect(containsNormalized("In Utero", "uter")).toBe(true)
    expect(containsNormalized("Hello", "")).toBe(false)
    expect(containsNormalized(null, "x")).toBe(false)
  })
})

describe("parseReleaseYear", () => {
  it("parses YYYY-MM-DD", () => {
    const item = queueItemFactory.build({
      track: metadataSourceTrackFactory.build({
        album: {
          id: "a",
          title: "A",
          urls: [],
          artists: [],
          releaseDate: "1993-05-01",
          releaseDatePrecision: "day",
          totalTracks: 1,
          label: "",
          images: [],
        },
      }),
    })
    expect(parseReleaseYear(item)).toBe(1993)
  })

  it("returns null for empty releaseDate", () => {
    const item = queueItemFactory.build({
      track: metadataSourceTrackFactory.build({
        album: {
          id: "a",
          title: "A",
          urls: [],
          artists: [],
          releaseDate: "",
          releaseDatePrecision: "year",
          totalTracks: 1,
          label: "",
          images: [],
        },
      }),
    })
    expect(parseReleaseYear(item)).toBeNull()
  })
})

describe("matchesCriterion", () => {
  const base = () =>
    queueItemFactory.build({
      title: "Heart-Shaped Box",
      track: metadataSourceTrackFactory.build({
        title: "Heart-Shaped Box",
        artists: [{ id: "1", title: "Nirvana", urls: [] }],
        album: {
          id: "a",
          title: "In Utero",
          urls: [],
          artists: [],
          releaseDate: "1993-09-21",
          releaseDatePrecision: "day",
          totalTracks: 12,
          label: "",
          images: [],
        },
        duration: 280_000,
      }),
      addedBy: userFactory.build({ username: "Ross" }),
    })

  it("matches releaseYearEq / between / decade", () => {
    const item = base()
    expect(matchesCriterion(item, { id: "1", type: "releaseYearEq", year: 1993 })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "releaseYearEq", year: 1994 })).toBe(false)
    expect(
      matchesCriterion(item, { id: "1", type: "releaseYearBetween", startYear: 1990, endYear: 1994 }),
    ).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "releaseDecadeEq", decade: 1990 })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "releaseDecadeEq", decade: 1980 })).toBe(false)
  })

  it("matches contains string criteria", () => {
    const item = base()
    expect(matchesCriterion(item, { id: "1", type: "artistContains", value: "vana" })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "titleContains", value: "shaped" })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "albumContains", value: "utero" })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "addedByContains", value: "ross" })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "artistContains", value: "beatles" })).toBe(false)
  })

  it("matches durationGt / durationLt strictly", () => {
    const item = base()
    expect(matchesCriterion(item, { id: "1", type: "durationGt", durationMs: 180_000 })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "durationGt", durationMs: 280_000 })).toBe(false)
    expect(matchesCriterion(item, { id: "1", type: "durationLt", durationMs: 300_000 })).toBe(true)
    expect(matchesCriterion(item, { id: "1", type: "durationLt", durationMs: 280_000 })).toBe(false)
  })

  it("does not match addedBy when username missing", () => {
    const item = base()
    item.addedBy = null
    expect(matchesCriterion(item, { id: "1", type: "addedByContains", value: "Ross" })).toBe(false)
  })
})
