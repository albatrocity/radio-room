import { describe, it, expect } from "vitest"
import { hasListenableStream, isHybridRadioRoom } from "./roomTypeHelpers"

describe("hasListenableStream", () => {
  it("returns true for radio rooms", () => {
    expect(hasListenableStream({ type: "radio" })).toBe(true)
  })

  it("returns true for live rooms", () => {
    expect(hasListenableStream({ type: "live" })).toBe(true)
  })

  it("returns false for jukebox rooms", () => {
    expect(hasListenableStream({ type: "jukebox" })).toBe(false)
  })

  it("returns false for null/undefined", () => {
    expect(hasListenableStream(null)).toBe(false)
    expect(hasListenableStream(undefined)).toBe(false)
  })
})

describe("isHybridRadioRoom", () => {
  it("returns true for radio with live ingest enabled", () => {
    expect(isHybridRadioRoom({ type: "radio", liveIngestEnabled: true })).toBe(true)
  })

  it("returns false when ingest disabled or not radio", () => {
    expect(isHybridRadioRoom({ type: "radio", liveIngestEnabled: false })).toBe(false)
    expect(isHybridRadioRoom({ type: "live", liveIngestEnabled: true })).toBe(false)
    expect(isHybridRadioRoom(null)).toBe(false)
  })
})
