import { describe, expect, it, afterEach, vi } from "vitest"
import {
  getMediaSourceCtor,
  isManagedMediaSource,
  mseRadioSupported,
  supportedRadioMimeType,
} from "./mediaSourceSupport"

describe("mediaSourceSupport", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns null without window", () => {
    const original = globalThis.window
    // @ts-expect-error test environment
    delete globalThis.window
    expect(getMediaSourceCtor()).toBeNull()
    globalThis.window = original
  })

  it("prefers ManagedMediaSource when present", () => {
    class ManagedMediaSource {}
    class MediaSource {
      static isTypeSupported = () => true
    }
    vi.stubGlobal("window", {
      ManagedMediaSource,
      MediaSource,
    })
    expect(getMediaSourceCtor()).toBe(ManagedMediaSource)
    expect(isManagedMediaSource()).toBe(true)
  })

  it("probes audio/mpeg before audio/aac", () => {
    class MediaSource {
      static isTypeSupported(type: string) {
        return type === "audio/mpeg"
      }
    }
    vi.stubGlobal("window", { MediaSource })
    expect(supportedRadioMimeType()).toBe("audio/mpeg")
    expect(mseRadioSupported()).toBe(true)
  })

  it("returns null when no mime is supported", () => {
    class MediaSource {
      static isTypeSupported = () => false
    }
    vi.stubGlobal("window", { MediaSource })
    expect(supportedRadioMimeType()).toBeNull()
    expect(mseRadioSupported()).toBe(false)
  })
})
