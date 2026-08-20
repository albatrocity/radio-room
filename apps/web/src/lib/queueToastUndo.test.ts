import { describe, expect, it, vi } from "vitest"

vi.mock("./toasts", () => ({
  toast: vi.fn(),
}))
vi.mock("./socket", () => ({
  default: { on: vi.fn(), off: vi.fn() },
}))
vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))

import { queuedAddUndoTrackId } from "./queueToastUndo"

describe("queuedAddUndoTrackId", () => {
  it("returns null when playback is not app-controlled", () => {
    expect(
      queuedAddUndoTrackId({
        playbackMode: "default",
        queuedTrack: { id: "t1" },
      }),
    ).toBeNull()
  })

  it("prefers the queued item track id in app-controlled rooms", () => {
    expect(
      queuedAddUndoTrackId({
        playbackMode: "app-controlled",
        queuedItem: { track: { id: "from-item" } as never },
        queuedTrack: { id: "from-context" },
      }),
    ).toBe("from-item")
  })

  it("falls back to the context track id", () => {
    expect(
      queuedAddUndoTrackId({
        playbackMode: "app-controlled",
        queuedTrack: { id: "from-context" },
      }),
    ).toBe("from-context")
  })
})
