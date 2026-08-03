import { describe, expect, it } from "vitest"
import { resolveBrowseCapabilities } from "./resolveBrowseCapabilities"

describe("resolveBrowseCapabilities", () => {
  it("returns getBrowseCapabilities when provided", () => {
    expect(
      resolveBrowseCapabilities({
        getBrowseCapabilities: () => ({ entryMode: "search", albumSearch: true }),
      }),
    ).toEqual({ entryMode: "search", albumSearch: true })
  })

  it("defaults to index and albumSearch from listAlbums presence", () => {
    expect(resolveBrowseCapabilities({})).toEqual({
      entryMode: "index",
      albumSearch: false,
    })
    expect(
      resolveBrowseCapabilities({
        listAlbums: async () => ({ items: [] }),
      }),
    ).toEqual({ entryMode: "index", albumSearch: true })
  })
})
