import { describe, expect, it, vi, afterEach } from "vitest"
import { createActor, fromCallback, type AnyEventObject } from "xstate"
import { radioStreamMachine } from "./radioStreamMachine"

const URL_A = "https://example.com/a.mp3"
const URL_B = "https://example.com/b.mp3"

/** Stub the audio engine so lifecycle is testable without Web Audio. */
function setup() {
  const runs: { url: string; stopped: boolean }[] = []
  const machine = radioStreamMachine.provide({
    actors: {
      streamRun: fromCallback<AnyEventObject, { url: string }>(({ input }) => {
        const run = { url: input.url, stopped: false }
        runs.push(run)
        return () => {
          run.stopped = true
        }
      }),
    },
  })
  const actor = createActor(machine).start()
  return { actor, runs }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("radioStreamMachine", () => {
  it("waits for a url before connecting", () => {
    const { actor, runs } = setup()
    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(runs).toHaveLength(0)

    actor.send({ type: "SET_URL", url: URL_A })
    expect(actor.getSnapshot().matches({ active: "connecting" })).toBe(true)
    expect(runs[0]?.url).toBe(URL_A)
  })

  it("does not connect while paused", () => {
    const { actor, runs } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(runs).toHaveLength(0)
  })

  it("stops the run on pause so decoded audio cannot outlive it", () => {
    const { actor, runs } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "STREAMING" })
    expect(actor.getSnapshot().matches({ active: "streaming" })).toBe(true)

    actor.send({ type: "PAUSE" })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(runs[0]?.stopped).toBe(true)
  })

  it("starts a fresh run when the url changes mid-stream", () => {
    const { actor, runs } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "SET_URL", url: URL_B })

    expect(runs).toHaveLength(2)
    expect(runs[0]?.stopped).toBe(true)
    expect(runs[1]?.url).toBe(URL_B)
  })

  it("reconnects after a stream that delivered audio drops", () => {
    vi.useFakeTimers()
    const { actor, runs } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ENDED", framesScheduled: 12 })

    expect(actor.getSnapshot().matches("reconnecting")).toBe(true)
    vi.advanceTimersByTime(1200)
    expect(actor.getSnapshot().matches({ active: "connecting" })).toBe(true)
    expect(runs).toHaveLength(2)
  })

  it("fails instead of reconnecting when a stream never produced audio", () => {
    const { actor } = setup()
    const failures: string[] = []
    actor.on("failed", ({ message }) => failures.push(message))

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ENDED", framesScheduled: 0 })

    expect(actor.getSnapshot().matches("failed")).toBe(true)
    expect(failures).toEqual(["streamEndedWithoutFrames"])
  })

  it("emits failure and retries only on an explicit play", () => {
    const { actor, runs } = setup()
    const failures: string[] = []
    actor.on("failed", ({ message }) => failures.push(message))

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ERROR", message: "http 404" })
    expect(actor.getSnapshot().matches("failed")).toBe(true)
    expect(failures).toEqual(["http 404"])
    expect(runs).toHaveLength(1)

    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ active: "connecting" })).toBe(true)
    expect(runs).toHaveLength(2)
  })

  it("announces playback start for the loading state", () => {
    const { actor } = setup()
    let started = 0
    actor.on("playbackStarted", () => (started += 1))

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "PLAYBACK_STARTED" })
    expect(started).toBe(1)
  })

  it("teardown stops the run and forgets the url", () => {
    const { actor, runs } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "TEARDOWN" })

    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.url).toBeNull()
    expect(runs[0]?.stopped).toBe(true)
  })
})
