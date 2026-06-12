import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getPollDisplayMode,
  setPollDisplayMode,
  readPollDisplayIndex,
  writePollDisplayIndex,
} from "./pollDisplayPreference"

describe("pollDisplayPreference", () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
  })

  it("defaults to expanded when no preference is stored", () => {
    expect(getPollDisplayMode("room-1", "poll-1")).toBe("expanded")
  })

  it("persists collapsed and hidden modes", () => {
    setPollDisplayMode("room-1", "poll-1", "collapsed")
    expect(getPollDisplayMode("room-1", "poll-1")).toBe("collapsed")

    setPollDisplayMode("room-1", "poll-2", "hidden")
    expect(getPollDisplayMode("room-1", "poll-2")).toBe("hidden")
  })

  it("evicts oldest entries past 100 in the LRU index", () => {
    for (let i = 0; i < 101; i++) {
      setPollDisplayMode("room-1", `poll-${i}`, "hidden")
    }

    const index = readPollDisplayIndex()
    expect(index).toHaveLength(100)
    expect(index[0]).toBe("room-1:poll-100")
    expect(getPollDisplayMode("room-1", "poll-0")).toBe("expanded")
    expect(getPollDisplayMode("room-1", "poll-100")).toBe("hidden")
  })

  it("clears storage when mode returns to expanded", () => {
    setPollDisplayMode("room-1", "poll-1", "collapsed")
    setPollDisplayMode("room-1", "poll-1", "expanded")
    expect(getPollDisplayMode("room-1", "poll-1")).toBe("expanded")
    expect(readPollDisplayIndex()).not.toContain("room-1:poll-1")
  })

  it("writePollDisplayIndex round-trips through readPollDisplayIndex", () => {
    writePollDisplayIndex(["a:1", "b:2"])
    expect(readPollDisplayIndex()).toEqual(["a:1", "b:2"])
  })
})
