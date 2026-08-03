import { describe, expect, it } from "vitest"
import { rankByTitleRelevance, takeTopByTitleRelevance } from "./rankByTitleRelevance"

describe("rankByTitleRelevance", () => {
  it("returns items unchanged when query is empty", () => {
    const items = [{ title: "A" }, { title: "B" }]
    expect(rankByTitleRelevance("  ", items)).toEqual(items)
  })

  it("puts a strong title match ahead of weaker ones", () => {
    const items = [
      { title: "Completely Different", id: "weak" },
      { title: "Neon Lights", id: "exact" },
      { title: "Neon Lights (Live)", id: "close" },
    ]
    const ranked = rankByTitleRelevance("Neon Lights", items)
    expect(ranked.map((t) => t.id)).toEqual(["exact", "close", "weak"])
  })

  it("uses stable original-index tie-break", () => {
    const items = [
      { title: "Foo Bar", id: "a" },
      { title: "Foo Bar", id: "b" },
    ]
    expect(rankByTitleRelevance("Foo Bar", items).map((t) => t.id)).toEqual(["a", "b"])
  })
})

describe("takeTopByTitleRelevance", () => {
  it("caps to limit after ranking", () => {
    const items = [
      { title: "zzz unrelated", id: "1" },
      { title: "Alpha", id: "2" },
      { title: "Alpha Beta", id: "3" },
      { title: "Something Alpha", id: "4" },
    ]
    const top = takeTopByTitleRelevance("Alpha", items, 2)
    expect(top).toHaveLength(2)
    expect(top[0]?.id).toBe("2")
  })
})
