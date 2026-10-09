import { describe, expect, it } from "vitest"
import {
  applyCorsHeaders,
  buildIcyMetadataBlock,
  formatStreamTitle,
  wantsIcyMetadata,
} from "./icy.js"

describe("formatStreamTitle", () => {
  it("uses Title | Artist | Album", () => {
    expect(
      formatStreamTitle({ title: "Stub Signal", artist: "Dev Radio", album: "Local Testing" }),
    ).toBe("Stub Signal | Dev Radio | Local Testing")
  })
})

describe("buildIcyMetadataBlock", () => {
  it("prefixes a length unit and pads to 16-byte multiples", () => {
    const block = buildIcyMetadataBlock("Stub Signal | Dev Radio | Local Testing")
    expect(block[0]).toBeGreaterThan(0)
    expect(block.length).toBe(1 + block[0]! * 16)
    const payload = block.subarray(1).toString("utf8")
    expect(payload.startsWith("StreamTitle='Stub Signal | Dev Radio | Local Testing';")).toBe(
      true,
    )
  })

  it("strips single quotes from the title payload", () => {
    const block = buildIcyMetadataBlock("It's Fine")
    const payload = block.subarray(1).toString("utf8")
    expect(payload).toContain("StreamTitle='Its Fine';")
    expect(payload).not.toContain("It's")
  })
})

describe("applyCorsHeaders", () => {
  it("adds permissive local-dev CORS headers", () => {
    const headers = applyCorsHeaders({ "Content-Type": "audio/mpeg" })
    expect(headers["Access-Control-Allow-Origin"]).toBe("*")
    expect(headers["Content-Type"]).toBe("audio/mpeg")
  })
})

describe("wantsIcyMetadata", () => {
  it("requires icy-metadata: 1", () => {
    expect(wantsIcyMetadata("1")).toBe(true)
    expect(wantsIcyMetadata("0")).toBe(false)
    expect(wantsIcyMetadata(undefined)).toBe(false)
  })
})
