import { describe, expect, it, vi, afterEach } from "vitest"
import { createActor, fromCallback, type AnyEventObject } from "xstate"
import { radioStreamMachine } from "./radioStreamMachine"

const URL_A = "https://example.com/a.mp3"
const URL_B = "https://example.com/b.mp3"

type Run = { url: string; stopped: boolean }

/** Stub both transports so lifecycle is testable without media or Web Audio. */
function setup() {
  const playbacks: Run[] = []
  const analyses: Run[] = []
  const machine = radioStreamMachine.provide({
    actors: {
      elementPlayback: fromCallback<AnyEventObject, { url: string }>(({ input }) => {
        const run = { url: input.url, stopped: false }
        playbacks.push(run)
        return () => {
          run.stopped = true
        }
      }),
      analysisRun: fromCallback<AnyEventObject, { url: string }>(({ input }) => {
        const run = { url: input.url, stopped: false }
        analyses.push(run)
        return () => {
          run.stopped = true
        }
      }),
    },
  })
  const actor = createActor(machine).start()
  return { actor, playbacks, analyses }
}

/** Analysis only runs when watched — most playback tests want it enabled. */
function watchScope(actor: ReturnType<typeof setup>["actor"]) {
  actor.send({ type: "VISIBILITY", visible: true })
  actor.send({ type: "SCOPE_ATTACHED" })
}

afterEach(() => {
  vi.useRealTimers()
})

describe("radioStreamMachine playback", () => {
  it("waits for a url before starting the element", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ playback: "idle" })).toBe(true)
    expect(playbacks).toHaveLength(0)

    actor.send({ type: "SET_URL", url: URL_A })
    expect(actor.getSnapshot().matches({ playback: { active: "loading" } })).toBe(true)
    expect(playbacks[0]?.url).toBe(URL_A)
  })

  it("does not start while paused", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    expect(actor.getSnapshot().matches({ playback: "idle" })).toBe(true)
    expect(playbacks).toHaveLength(0)
  })

  it("reports playing only once the element says so", () => {
    const { actor } = setup()
    let started = 0
    actor.on("playbackStarted", () => (started += 1))

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ playback: { active: "loading" } })).toBe(true)
    expect(started).toBe(0)

    actor.send({ type: "ELEMENT_PLAYING" })
    expect(actor.getSnapshot().matches({ playback: { active: "playing" } })).toBe(true)
    expect(started).toBe(1)
  })

  it("stops the element on pause", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ELEMENT_PLAYING" })

    actor.send({ type: "PAUSE" })
    expect(actor.getSnapshot().matches({ playback: "idle" })).toBe(true)
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

    expect(actor.getSnapshot().matches({ playback: "reconnecting" })).toBe(true)
    vi.advanceTimersByTime(1200)
    expect(actor.getSnapshot().matches({ playback: { active: "loading" } })).toBe(true)
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

    expect(actor.getSnapshot().matches({ playback: "failed" })).toBe(true)
    expect(failures).toEqual(["mediaSrcNotSupported"])

    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ playback: { active: "loading" } })).toBe(true)
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

    expect(actor.getSnapshot().matches({ playback: { active: "playing" } })).toBe(true)
  })

  it("teardown stops the element and forgets the url", () => {
    const { actor, playbacks } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "TEARDOWN" })

    expect(actor.getSnapshot().matches({ playback: "idle" })).toBe(true)
    expect(actor.getSnapshot().context.url).toBeNull()
    expect(playbacks[0]?.stopped).toBe(true)
  })
})

describe("radioStreamMachine analysis gating", () => {
  it("stays closed for a listener without the oscilloscope", () => {
    const { actor, analyses } = setup()
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ELEMENT_PLAYING" })

    expect(actor.getSnapshot().matches({ analysis: "off" })).toBe(true)
    expect(analyses).toHaveLength(0)
  })

  it("opens once a scope is watching and playback is wanted", () => {
    const { actor, analyses } = setup()
    watchScope(actor)
    expect(analyses).toHaveLength(0)

    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    expect(actor.getSnapshot().matches({ analysis: "on" })).toBe(true)
    expect(analyses[0]?.url).toBe(URL_A)
  })

  it("closes when the scope unmounts or the tab is hidden", () => {
    const { actor, analyses } = setup()
    watchScope(actor)
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })

    actor.send({ type: "VISIBILITY", visible: false })
    expect(actor.getSnapshot().matches({ analysis: "off" })).toBe(true)
    expect(analyses[0]?.stopped).toBe(true)

    actor.send({ type: "VISIBILITY", visible: true })
    expect(analyses).toHaveLength(2)

    actor.send({ type: "SCOPE_DETACHED" })
    expect(actor.getSnapshot().matches({ analysis: "off" })).toBe(true)
    expect(analyses[1]?.stopped).toBe(true)
  })

  it("closes on pause alongside playback", () => {
    const { actor, analyses } = setup()
    watchScope(actor)
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "PAUSE" })

    expect(actor.getSnapshot().matches({ analysis: "off" })).toBe(true)
    expect(analyses[0]?.stopped).toBe(true)
  })

  it("gives up on an undecodable station without disturbing playback", () => {
    vi.useFakeTimers()
    const { actor, analyses } = setup()
    watchScope(actor)
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })
    actor.send({ type: "ELEMENT_PLAYING" })

    for (let i = 0; i < 3; i++) {
      actor.send({ type: "ANALYSIS_ERROR", message: "unsupportedContentType:audio/aacp" })
      vi.advanceTimersByTime(5000)
    }

    expect(analyses).toHaveLength(3)
    expect(actor.getSnapshot().matches({ analysis: "off" })).toBe(true)
    expect(actor.getSnapshot().matches({ playback: { active: "playing" } })).toBe(true)
  })

  it("a recovered analysis connection resets its failure budget", () => {
    vi.useFakeTimers()
    const { actor, analyses } = setup()
    watchScope(actor)
    actor.send({ type: "SET_URL", url: URL_A })
    actor.send({ type: "PLAY" })

    for (let i = 0; i < 5; i++) {
      actor.send({ type: "ANALYSIS_STREAMING" })
      actor.send({ type: "ANALYSIS_ENDED" })
      vi.advanceTimersByTime(5000)
    }

    expect(actor.getSnapshot().matches({ analysis: "on" })).toBe(true)
    expect(analyses.length).toBeGreaterThan(3)
  })
})
