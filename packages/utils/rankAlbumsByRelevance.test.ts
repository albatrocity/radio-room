import { describe, expect, it } from "vitest"
import { rankAlbumsByRelevance } from "./rankAlbumsByRelevance"

const hit = (source: string, artist: string, title: string) => ({ source, artist, title })

describe("rankAlbumsByRelevance", () => {
  const hits = [
    hit("spotify", "The Byrds", "Sweetheart Of The Rodeo"),
    hit("spotify", "Gene Clark", "No Other (Deluxe Edition)"),
    hit("spotify", "Gene Clark", "No Other"),
    hit("local", "Gene Clark", "White Light"),
    hit("local", "Gene Clark", "No Other"),
  ]

  it("orders by title and artist relevance", () => {
    const ranked = rankAlbumsByRelevance("no other", hits)
    expect(ranked.slice(0, 2).map((h) => h.title)).toEqual(["No Other", "No Other"])
    expect(ranked.at(-1)?.title).not.toMatch(/No Other/)
  })

  it("moves relevant local hits to the top, leaving irrelevant ones in place", () => {
    const ranked = rankAlbumsByRelevance("gene clark no other", hits, { promoteSource: "local" })
    expect(ranked[0]).toEqual(hit("local", "Gene Clark", "No Other"))
    const sweetheart = ranked.findIndex((h) => h.title === "Sweetheart Of The Rodeo")
    expect(sweetheart).toBe(ranked.length - 1)
  })

  it("leaves a blank query alone", () => {
    expect(rankAlbumsByRelevance(" ", hits, { promoteSource: "local" })).toBe(hits)
  })
})
