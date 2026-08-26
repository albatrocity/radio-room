import { describe, expect, test } from "vitest"
import type { Room } from "@repo/types/Room"
import { applyQueueDisplayEverEnabledFlags } from "./queueDisplayEverEnabled"

function baseRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room1",
    creator: "user1",
    type: "jukebox",
    title: "Test Room",
    fetchMeta: true,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastRefreshedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("applyQueueDisplayEverEnabledFlags", () => {
  test("sets showQueueCountEverEnabled when disabling queue count", () => {
    const previous = baseRoom({ showQueueCount: true })
    const result = applyQueueDisplayEverEnabledFlags(previous, { showQueueCount: false })
    expect(result.showQueueCountEverEnabled).toBe(true)
  })

  test("sets showQueueTracksEverEnabled when disabling queue tracks", () => {
    const previous = baseRoom({ showQueueTracks: true })
    const result = applyQueueDisplayEverEnabledFlags(previous, { showQueueTracks: false })
    expect(result.showQueueTracksEverEnabled).toBe(true)
  })

  test("does not set flags when already disabled", () => {
    const previous = baseRoom({ showQueueCount: false, showQueueTracks: false })
    const result = applyQueueDisplayEverEnabledFlags(previous, {
      showQueueCount: false,
      showQueueTracks: false,
    })
    expect(result.showQueueCountEverEnabled).toBeUndefined()
    expect(result.showQueueTracksEverEnabled).toBeUndefined()
  })

  test("does not set flags when enabling only", () => {
    const previous = baseRoom({ showQueueCount: false })
    const result = applyQueueDisplayEverEnabledFlags(previous, { showQueueCount: true })
    expect(result.showQueueCountEverEnabled).toBeUndefined()
  })

  test("treats default-enabled room as enabled when disabling", () => {
    const previous = baseRoom()
    const result = applyQueueDisplayEverEnabledFlags(previous, { showQueueCount: false })
    expect(result.showQueueCountEverEnabled).toBe(true)
  })
})
