/**
 * Guards the `useSocketMachine` allowlists (ADR 0093) against drift: if a
 * machine gains a socket-driven event and its allowlist is not updated, the
 * event would be silently dropped at the hub instead of failing loudly.
 */

import { describe, expect, it, vi } from "vitest"
import type { AnyStateMachine } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
}))
vi.mock("../actors/authActor", () => ({ getIsAdmin: () => true }))
vi.mock("../actors/roomActor", () => ({ getCurrentRoom: () => null }))
vi.mock("../actors/djActor", () => ({ canAddToQueue: () => true }))
vi.mock("../lib/toasts", () => ({ toast: vi.fn() }))

import { CATALOG_BROWSE_EVENT_TYPES, catalogBrowseMachine } from "./catalogBrowseMachine"
import { MEDIA_ITEM_TRACKS_EVENT_TYPES, mediaItemTracksMachine } from "./mediaItemTracksMachine"
import { QUEUE_EVENT_TYPES, queueMachine } from "./queueMachine"
import { TRACK_SEARCH_EVENT_TYPES, trackSearchMachine } from "./trackSearchMachine"

/** Events a component sends into the machine itself; never delivered by the socket hub. */
const cases: Array<{
  name: string
  machine: AnyStateMachine
  allowlist: string[]
  locallySent: string[]
}> = [
  {
    name: "trackSearchMachine",
    machine: trackSearchMachine,
    allowlist: TRACK_SEARCH_EVENT_TYPES,
    locallySent: ["FETCH_RESULTS"],
  },
  {
    name: "catalogBrowseMachine",
    machine: catalogBrowseMachine,
    allowlist: CATALOG_BROWSE_EVENT_TYPES,
    locallySent: ["FETCH_ARTISTS", "FETCH_ALBUMS", "FETCH_ARTIST", "FETCH_ALBUM", "FETCH_MEDIA"],
  },
  {
    name: "queueMachine",
    machine: queueMachine,
    allowlist: QUEUE_EVENT_TYPES,
    locallySent: ["SEND_TO_QUEUE"],
  },
  {
    name: "mediaItemTracksMachine",
    machine: mediaItemTracksMachine,
    allowlist: MEDIA_ITEM_TRACKS_EVENT_TYPES,
    locallySent: ["FETCH", "RESET"],
  },
]

describe("socket event allowlists", () => {
  it.each(cases)(
    "$name allows exactly its socket-driven events",
    ({ machine, allowlist, locallySent }) => {
      const handled = machine.events
      expect(handled.length).toBeGreaterThan(0)

      const expected = handled.filter((type) => !locallySent.includes(type)).sort()
      expect([...allowlist].sort()).toEqual(expected)
    },
  )
})
