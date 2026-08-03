import { describe, expect, test } from "vitest"
import {
  ensureBridgeMetadataSources,
  normalizeBridgeMetadataSourceIds,
  seedBridgeMetadataSources,
  stripBridgeOnlyMetadataSources,
} from "./bridgeMetadataSourcePolicy"

describe("normalizeBridgeMetadataSourceIds", () => {
  test("requires spotify and strips youtube when unavailable", () => {
    expect(
      normalizeBridgeMetadataSourceIds(["youtube", "local"], { youtubeAvailable: false }),
    ).toEqual(["spotify", "local"])
  })

  test("keeps youtube when available", () => {
    expect(
      normalizeBridgeMetadataSourceIds(["youtube", "local"], { youtubeAvailable: true }),
    ).toEqual(["spotify", "youtube", "local"])
  })

  test("drops unknown ids", () => {
    expect(
      normalizeBridgeMetadataSourceIds(["spotify", "ghost"], { youtubeAvailable: true }),
    ).toEqual(["spotify"])
  })
})

describe("seedBridgeMetadataSources", () => {
  test("adds youtube only when available, always adds local", () => {
    expect(seedBridgeMetadataSources(["spotify"], { youtubeAvailable: false })).toEqual([
      "spotify",
      "local",
    ])
    expect(seedBridgeMetadataSources(["spotify"], { youtubeAvailable: true })).toEqual([
      "spotify",
      "youtube",
      "local",
    ])
  })
})

describe("stripBridgeOnlyMetadataSources", () => {
  test("removes youtube/local and falls back to spotify", () => {
    expect(stripBridgeOnlyMetadataSources(["youtube", "local"])).toEqual(["spotify"])
    expect(stripBridgeOnlyMetadataSources(["spotify", "tidal", "youtube"])).toEqual([
      "spotify",
      "tidal",
    ])
  })
})

describe("ensureBridgeMetadataSources", () => {
  test("no-ops unless bridge + ids present", () => {
    expect(ensureBridgeMetadataSources("spotify", ["spotify"])).toEqual(["spotify"])
    expect(ensureBridgeMetadataSources("bridge", undefined)).toBeUndefined()
    expect(
      ensureBridgeMetadataSources("bridge", ["spotify"], { youtubeAvailable: true }),
    ).toEqual(["spotify", "youtube", "local"])
  })
})
