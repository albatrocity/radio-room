import { describe, expect, it } from "vitest"
import type { MetadataSourceTrack } from "@repo/types"
import { rankSearchResultsByRelevance } from "./rankSearchResultsByRelevance"

function track(
  partial: Pick<MetadataSourceTrack, "title"> &
    Partial<Pick<MetadataSourceTrack, "artists" | "album">> & { source?: string; id?: string },
): MetadataSourceTrack & { source?: string } {
  return {
    id: partial.id ?? partial.title,
    title: partial.title,
    urls: [],
    artists: partial.artists ?? [{ id: "a", title: "Unknown", urls: [], images: [] }],
    album: partial.album ?? {
      id: "",
      title: "",
      urls: [],
      artists: [],
      releaseDate: "",
      releaseDatePrecision: "year",
      totalTracks: 0,
      label: "",
      images: [],
    },
    duration: 180,
    explicit: false,
    trackNumber: 1,
    discNumber: 1,
    popularity: 0,
    images: [],
    source: partial.source,
  }
}

describe("rankSearchResultsByRelevance", () => {
  it("returns items unchanged when query is empty", () => {
    const items = [track({ title: "A", source: "spotify" }), track({ title: "B", source: "local" })]
    expect(rankSearchResultsByRelevance("  ", items)).toEqual(items)
  })

  it("returns items unchanged when length <= 1", () => {
    const items = [track({ title: "Only", source: "local" })]
    expect(rankSearchResultsByRelevance("Only", items)).toEqual(items)
  })

  it("puts a strong title match ahead of weaker cross-source hits", () => {
    const items = [
      track({
        title: "Completely Different Song",
        artists: [{ id: "1", title: "Other Artist", urls: [], images: [] }],
        source: "spotify",
        id: "sp1",
      }),
      track({
        title: "Neon Lights",
        artists: [{ id: "2", title: "Local Band", urls: [], images: [] }],
        source: "youtube",
        id: "yt1",
      }),
      track({
        title: "Neon Lights (Live)",
        artists: [{ id: "3", title: "Local Band", urls: [], images: [] }],
        source: "local",
        id: "loc1",
      }),
    ]

    const ranked = rankSearchResultsByRelevance("Neon Lights", items)
    expect(ranked.map((t) => t.id)).toEqual(["yt1", "loc1", "sp1"])
  })

  it("uses stable original-index tie-break for equal-ish matches", () => {
    const items = [
      track({ title: "Foo Bar", source: "spotify", id: "a" }),
      track({ title: "Foo Bar", source: "local", id: "b" }),
    ]
    const ranked = rankSearchResultsByRelevance("Foo Bar", items)
    expect(ranked.map((t) => t.id)).toEqual(["a", "b"])
  })

  it("ranks artist matches when title alone is weak", () => {
    const items = [
      track({
        title: "Instrumental 12",
        artists: [{ id: "1", title: "Random", urls: [], images: [] }],
        source: "spotify",
        id: "sp",
      }),
      track({
        title: "B-Side",
        artists: [{ id: "2", title: "Radiohead", urls: [], images: [] }],
        source: "local",
        id: "loc",
      }),
    ]
    const ranked = rankSearchResultsByRelevance("Radiohead", items)
    expect(ranked[0]?.id).toBe("loc")
  })
})
