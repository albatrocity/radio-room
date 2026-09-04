import { describe, expect, it } from "vitest"
import { isLeaseStale, pickBridgeDevice, shouldReloadForBlindSdk } from "./spotifyDevice"

const NOW = 1_700_000_000_000

describe("shouldReloadForBlindSdk", () => {
  it("does not reload while another source owns playback", () => {
    // The 10-minute local/YouTube stretch: blind is expected, not broken.
    expect(
      shouldReloadForBlindSdk({
        spotifyExpectedActive: false,
        blindSince: NOW - 10 * 60_000,
        now: NOW,
      }),
    ).toBe(false)
  })

  it("reloads when Spotify should be audible but the SDK stays blind", () => {
    expect(
      shouldReloadForBlindSdk({
        spotifyExpectedActive: true,
        blindSince: NOW - 16_000,
        now: NOW,
      }),
    ).toBe(true)
  })

  it("gives a just-commanded player time to become the active device", () => {
    expect(
      shouldReloadForBlindSdk({ spotifyExpectedActive: true, blindSince: NOW - 5_000, now: NOW }),
    ).toBe(false)
  })

  it("treats no blind streak as healthy", () => {
    expect(shouldReloadForBlindSdk({ spotifyExpectedActive: true, blindSince: 0, now: NOW })).toBe(
      false,
    )
  })
})

describe("isLeaseStale", () => {
  it("treats a never-established lease as stale", () => {
    expect(isLeaseStale(0, NOW)).toBe(true)
  })

  it("keeps back-to-back Spotify tracks free of a renewal", () => {
    expect(isLeaseStale(NOW - 30_000, NOW)).toBe(false)
  })

  it("renews after a long non-Spotify stretch", () => {
    expect(isLeaseStale(NOW - 10 * 60_000, NOW)).toBe(true)
  })
})

describe("pickBridgeDevice", () => {
  const bridge = (id: string, is_active = false) => ({
    id,
    name: "Listening Room Bridge",
    is_active,
  })

  it("prefers the id this player just reported ready", () => {
    // A recreated player leaves the previous one listed; first-match picks the corpse.
    const devices = [bridge("stale-1"), bridge("fresh-2")]
    expect(pickBridgeDevice(devices, "fresh-2")?.id).toBe("fresh-2")
  })

  it("falls back to the active device when the ready id is not listed", () => {
    const devices = [bridge("stale-1"), bridge("active-2", true)]
    expect(pickBridgeDevice(devices, "unlisted")?.id).toBe("active-2")
  })

  it("uses the only listed bridge device when nothing is active", () => {
    expect(pickBridgeDevice([bridge("only-1")], "unlisted")?.id).toBe("only-1")
  })

  it("ignores devices under a different Connect name", () => {
    expect(
      pickBridgeDevice([{ id: "desktop", name: "Mac mini", is_active: true }], "desktop"),
    ).toBeUndefined()
  })

  it("ignores listed devices with a null id", () => {
    expect(pickBridgeDevice([{ id: null, name: "Listening Room Bridge" }], "x")).toBeUndefined()
  })
})
