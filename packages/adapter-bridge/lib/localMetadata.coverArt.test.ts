import { describe, expect, it } from "vitest"
import { normalizePlaylistCoverArtResult } from "./localMetadata"

describe("normalizePlaylistCoverArtResult", () => {
  it("maps a legacy flat data-URI record onto sm", () => {
    expect(
      normalizePlaylistCoverArtResult({
        "nd-lp": "data:image/jpeg;base64,abc",
        skip: "https://example/not-a-data-uri",
      }),
    ).toEqual({ "nd-lp": { sm: "data:image/jpeg;base64,abc" } })
  })

  it("keeps nested sm/lg variants", () => {
    expect(
      normalizePlaylistCoverArtResult({
        "nd-lp": {
          sm: "data:image/jpeg;base64,sm",
          lg: "data:image/jpeg;base64,lg",
        },
      }),
    ).toEqual({
      "nd-lp": { sm: "data:image/jpeg;base64,sm", lg: "data:image/jpeg;base64,lg" },
    })
  })

  it("returns {} for non-objects", () => {
    expect(normalizePlaylistCoverArtResult(null)).toEqual({})
    expect(normalizePlaylistCoverArtResult("nope")).toEqual({})
  })
})
