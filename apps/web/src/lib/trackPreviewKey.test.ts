import { describe, expect, it } from "vitest"
import { trackPreviewKey } from "./trackPreviewKey"

describe("trackPreviewKey", () => {
  it("uses the track's own source", () => {
    expect(trackPreviewKey({ id: "t1", source: "spotify" }, "local")).toBe("spotify-t1")
  })

  it("falls back for source-less rows", () => {
    expect(trackPreviewKey({ id: "t1" }, "local")).toBe("local-t1")
    expect(trackPreviewKey({ id: "t1", source: "  " }, "spotify")).toBe("spotify-t1")
  })
})
