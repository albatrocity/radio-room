import { describe, expect, it, vi, afterEach } from "vitest"
import { createActor, fromCallback, type AnyEventObject } from "xstate"
import { radioStreamMachine } from "./radioStreamMachine"

const URL_A = "https://example.com/a.mp3"
const URL_B = "https://example.com/b.mp3"

type Run = { url: string; stopped: boolean }

/** Stub playback so lifecycle is testable without media or Web Audio. */
function setup() {
  const playbacks: Run[] = []
  const machine = radioStreamMachine.provide({
    actors: {
      playbackRun: fromCallback<AnyEventObject, { url: string; mseRejected: boolean }>(
        ({ input }) => {
          const run = { url: input.url, stopped: false }
          playbacks.push(run)
          return () => {
            run.stopped = true
          }
        },
      ),
    },
  })
  const actor = createActor(machine).start()
  return { actor, playbacks }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("radioStreamMachine playback", () => {
  it("waits for a url before starting the element", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(playbacks).toHaveLength(0)

    actor.send({ type: "SET_URL", url: URL_A })
    expect(actor.getSnapshot().matches({ active: "loading" })).toBe(true)
    expect(playbacks[0]?.url).toBe(URL_A)
  })

  it("does not start while paused", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(playbacks).toHaveLength(0)
  })

  it("reports playing only once the element says so", () => {
    const { actor } = setup()
    let started = 0
    actor.on("playbackStarted", () => (started += 1))

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ active: "loading" })).toBe(true)
    expect(started).toBe(0)

    actor.send({ type: "ELEMENT_PLAYING" })
    expect(actor.getSnapshot().matches({ active: "playing" })).toBe(true)
    expect(started).toBe(1)
  })

  it("stops the element on pause", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ELEMENT_PLAYING" })

    actor.send({ type: "PAUSE" })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(playbacks[0]?.stopped).toBe(true)
  })

  it("starts a fresh element run when the url changes mid-stream", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "SET_URL", url: URL_B })

    expect(playbacks).toHaveLength(2)
    expect(playbacks[0]?.stopped).toBe(true)
    expect(playbacks[1]?.url).toBe(URL_B)
  })

  it("retries a dropped stream before giving up", () => {
    vi.useFakeTimers()
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ELEMENT_ERROR", message: "mediaNetwork" })

    expect(actor.getSnapshot().matches("reconnecting")).toBe(true)
    vi.advanceTimersByTime(1200)
    expect(actor.getSnapshot().matches({ active: "loading" })).toBe(true)
    expect(playbacks).toHaveLength(2)
  })

  it("fails after repeated errors and retries only on an explicit play", () => {
    vi.useFakeTimers()
    const { actor } = setup()
    const failures: string[] = []
    actor.on("failed", ({ message }) => failures.push(message))

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    for (let i = 0; i < 3; i++) {
      actor.send({ type: "ELEMENT_ERROR", message: "mediaNetwork" })
      vi.advanceTimersByTime(1200)
    }
    actor.send({ type: "ELEMENT_ERROR", message: "mediaSrcNotSupported" })

    expect(actor.getSnapshot().matches("failed")).toBe(true)
    expect(failures).toEqual(["mediaSrcNotSupported"])

    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ active: "loading" })).toBe(true)
  })

  it("a stream that recovers resets the retry budget", () => {
    vi.useFakeTimers()
    const { actor } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })

    for (let i = 0; i < 5; i++) {
      actor.send({ type: "ELEMENT_ERROR", message: "mediaNetwork" })
      vi.advanceTimersByTime(1200)
      actor.send({ type: "ELEMENT_PLAYING" })
    }

    expect(actor.getSnapshot().matches({ active: "playing" })).toBe(true)
  })

  it("teardown stops the element and forgets the url", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "TEARDOWN" })

    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.url).toBeNull()
    expect(playbacks[0]?.stopped).toBe(true)
  })

  it("marks mse rejected when MSE falls back before playing", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "MSE_FALLBACK" })

    expect(actor.getSnapshot().context.mseRejected).toBe(true)
    expect(actor.getSnapshot().matches({ active: "loading" })).toBe(true)
    expect(playbacks.length).toBeGreaterThanOrEqual(1)
  })
})
