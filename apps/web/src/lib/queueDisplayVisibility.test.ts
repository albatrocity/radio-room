import { describe, expect, test } from "vitest"
import type { Room } from "../types/Room"
import {
  getQueueCountDisplay,
  isQueueCountRedacted,
  isQueueCountVisible,
  isQueueTracksRedacted,
  isQueueTracksVisible,
} from "./queueDisplayVisibility"

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "room1",
    type: "jukebox",
    title: "Test",
    fetchMeta: true,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    ...overrides,
  }
}

describe("queueDisplayVisibility", () => {
  describe("isQueueCountVisible", () => {
    test("admins always see count", () => {
      expect(isQueueCountVisible(room({ showQueueCount: false }), true)).toBe(true)
    })

    test("listeners see count when enabled", () => {
      expect(isQueueCountVisible(room(), false)).toBe(true)
    })

    test("listeners hide count when disabled", () => {
      expect(isQueueCountVisible(room({ showQueueCount: false }), false)).toBe(false)
    })
  })

  describe("isQueueCountRedacted", () => {
    test("admins are never redacted", () => {
      expect(isQueueCountRedacted(room({ showQueueCount: false }), true)).toBe(false)
    })

    test("legacy disabled rooms are redacted for listeners", () => {
      expect(isQueueCountRedacted(room({ showQueueCount: false }), false)).toBe(true)
    })

    test("explicit reset stops redaction", () => {
      expect(
        isQueueCountRedacted(
          room({ showQueueCount: false, showQueueCountEverEnabled: false }),
          false,
        ),
      ).toBe(false)
    })
  })

  describe("isQueueTracksVisible / Redacted", () => {
    test("mirrors count semantics for tracks", () => {
      expect(isQueueTracksVisible(room({ showQueueTracks: false }), false)).toBe(false)
      expect(isQueueTracksRedacted(room({ showQueueTracks: false }), false)).toBe(true)
      expect(
        isQueueTracksRedacted(
          room({ showQueueTracks: false, showQueueTracksEverEnabled: false }),
          false,
        ),
      ).toBe(false)
    })
  })

  describe("getQueueCountDisplay", () => {
    test("returns count when visible and non-zero", () => {
      expect(getQueueCountDisplay(3, room(), false)).toEqual({ kind: "count", value: 3 })
    })

    test("returns hidden when visible but zero", () => {
      expect(getQueueCountDisplay(0, room(), false)).toEqual({ kind: "hidden" })
    })

    test("returns redacted when disabled and ever enabled", () => {
      expect(getQueueCountDisplay(5, room({ showQueueCount: false }), false)).toEqual({
        kind: "redacted",
      })
    })

    test("returns hidden when disabled and reset", () => {
      expect(
        getQueueCountDisplay(
          5,
          room({ showQueueCount: false, showQueueCountEverEnabled: false }),
          false,
        ),
      ).toEqual({ kind: "hidden" })
    })
  })
})
