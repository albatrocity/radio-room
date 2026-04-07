import { describe, it, expect } from "vitest"
import { hasListenableStream } from "./roomTypeHelpers"

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
