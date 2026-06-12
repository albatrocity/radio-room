import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"
import { pollCardDisplayMachine } from "./pollCardDisplayMachine"

describe("pollCardDisplayMachine", () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
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

  it("starts from hydrated mode", () => {
    const actor = createActor(pollCardDisplayMachine, {
      input: { roomId: "room-1", pollId: "poll-1", initialMode: "collapsed" },
    })
    actor.start()
    expect(actor.getSnapshot().value).toBe("collapsed")
  })

  it("maps hidden storage mode to dismissed", () => {
    const actor = createActor(pollCardDisplayMachine, {
      input: { roomId: "room-1", pollId: "poll-1", initialMode: "hidden" },
    })
    actor.start()
    expect(actor.getSnapshot().value).toBe("dismissed")
  })

  it("auto-expands on new poll publish", () => {
    const actor = createActor(pollCardDisplayMachine, {
      input: { roomId: "room-1", pollId: "poll-1", initialMode: "hidden" },
    })
    actor.start()
    expect(actor.getSnapshot().value).toBe("dismissed")

    actor.send({ type: "NEW_POLL_PUBLISHED", pollId: "poll-2" })
    expect(actor.getSnapshot().value).toBe("expanded")
    expect(actor.getSnapshot().context.pollId).toBe("poll-2")
  })

  it("enters revealing on poll closed and restores previous mode on timeout event", () => {
    const actor = createActor(pollCardDisplayMachine, {
      input: { roomId: "room-1", pollId: "poll-1", initialMode: "collapsed" },
    })
    actor.start()

    actor.send({ type: "POLL_CLOSED" })
    expect(actor.getSnapshot().value).toBe("revealing")
    expect(actor.getSnapshot().context.revealStartedAt).not.toBeNull()
    expect(actor.getSnapshot().context.previousMode).toBe("collapsed")

    actor.send({ type: "REVEAL_TIMEOUT" })
    expect(actor.getSnapshot().value).toBe("collapsed")
    expect(actor.getSnapshot().context.revealStartedAt).toBeNull()
  })
})
