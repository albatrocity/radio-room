import { describe, expect, it } from "vitest"
import { metadataSourceSupportsBrowse } from "./metadataSourceSupportsBrowse"

describe("metadataSourceSupportsBrowse", () => {
  it("returns true when all three browse methods are functions", () => {
    expect(
      metadataSourceSupportsBrowse({
        listArtists: async () => ({ items: [] }),
        getArtist: async () => null,
        getAlbum: async () => null,
      }),
    ).toBe(true)
  })

  it("returns false when any browse method is missing", () => {
    expect(
      metadataSourceSupportsBrowse({
        listArtists: async () => ({ items: [] }),
        getArtist: async () => null,
      }),
    ).toBe(false)
    expect(metadataSourceSupportsBrowse({})).toBe(false)
  })
})
