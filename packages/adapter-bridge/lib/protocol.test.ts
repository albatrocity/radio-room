import { describe, expect, it } from "vitest"
import { capabilitiesKey, parseStoredBridgeCapabilities } from "./protocol"

describe("parseStoredBridgeCapabilities", () => {
  it("parses a string array", () => {
    expect(parseStoredBridgeCapabilities(JSON.stringify(["youtube", "local"]))).toEqual([
      "youtube",
      "local",
    ])
  })

  it("returns null for missing or invalid payloads", () => {
    expect(parseStoredBridgeCapabilities(null)).toBeNull()
    expect(parseStoredBridgeCapabilities("")).toBeNull()
    expect(parseStoredBridgeCapabilities("{")).toBeNull()
    expect(parseStoredBridgeCapabilities(JSON.stringify(["youtube", 1]))).toBeNull()
    expect(parseStoredBridgeCapabilities(JSON.stringify({ services: ["local"] }))).toBeNull()
  })
})

describe("capabilitiesKey", () => {
  it("is room-scoped", () => {
    expect(capabilitiesKey("abc")).toBe("bridge:abc:capabilities")
  })
})
