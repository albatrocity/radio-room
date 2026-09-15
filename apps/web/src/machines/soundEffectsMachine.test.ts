import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const audioSend = vi.fn()
const playMock = vi.fn(() => Promise.resolve())
const pauseMock = vi.fn()
const loadMock = vi.fn()
const removeAttributeMock = vi.fn()
const addEventListenerMock = vi.fn()

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
}))

vi.mock("../actors/audioActor", () => ({
  audioActor: { send: (...args: unknown[]) => audioSend(...args) },
  getVolume: () => 1,
  isMuted: () => false,
}))

const areSoundEffectsEnabled = vi.fn(() => true)

vi.mock("../actors/soundEffectsPreferenceActor", () => ({
  areSoundEffectsEnabled: () => areSoundEffectsEnabled(),
}))

import { soundEffectsMachine } from "./soundEffectsMachine"

class MockAudio {
  volume = 1
  src: string
  pause = pauseMock
  load = loadMock
  play = playMock
  removeAttribute = removeAttributeMock
  addEventListener = addEventListenerMock

  constructor(src: string) {
    this.src = src
  }
}

describe("soundEffectsMachine", () => {
  beforeEach(() => {
    audioSend.mockClear()
    playMock.mockClear()
    pauseMock.mockClear()
    loadMock.mockClear()
    removeAttributeMock.mockClear()
    addEventListenerMock.mockClear()
    areSoundEffectsEnabled.mockReturnValue(true)
    vi.stubGlobal("Audio", MockAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("plays SOUND_EFFECT_QUEUED when preference is enabled", () => {
    const actor = createActor(soundEffectsMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({
      type: "SOUND_EFFECT_QUEUED",
      data: { url: "https://example.com/ding.mp3", volume: 0.5, duck: true },
    })

    expect(actor.getSnapshot().matches({ active: "playing" })).toBe(true)
    expect(playMock).toHaveBeenCalled()
    expect(audioSend).toHaveBeenCalledWith({ type: "SET_DUCK", source: "sfx" })
  })

  it("ignores SOUND_EFFECT_QUEUED when preference is disabled", () => {
    areSoundEffectsEnabled.mockReturnValue(false)
    const actor = createActor(soundEffectsMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({
      type: "SOUND_EFFECT_QUEUED",
      data: { url: "https://example.com/ding.mp3", volume: 0.5, duck: true },
    })

    expect(actor.getSnapshot().matches({ active: "waiting" })).toBe(true)
    expect(actor.getSnapshot().context.queue).toEqual([])
    expect(playMock).not.toHaveBeenCalled()
    expect(audioSend).not.toHaveBeenCalledWith({ type: "SET_DUCK", source: "sfx" })
  })

  it("does not enqueue while playing when preference is disabled", () => {
    const actor = createActor(soundEffectsMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({
      type: "SOUND_EFFECT_QUEUED",
      data: { url: "https://example.com/a.mp3", volume: 1 },
    })
    expect(actor.getSnapshot().matches({ active: "playing" })).toBe(true)

    areSoundEffectsEnabled.mockReturnValue(false)
    actor.send({
      type: "SOUND_EFFECT_QUEUED",
      data: { url: "https://example.com/b.mp3", volume: 1 },
    })

    expect(actor.getSnapshot().context.queue).toEqual([])
  })

  it("FLUSH while playing stops audio, clears queue and duck, returns to waiting", () => {
    const actor = createActor(soundEffectsMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({
      type: "SOUND_EFFECT_QUEUED",
      data: { url: "https://example.com/ding.mp3", volume: 1, duck: true },
    })
    expect(actor.getSnapshot().matches({ active: "playing" })).toBe(true)
    expect(actor.getSnapshot().context.currentSound).not.toBeNull()

    actor.send({ type: "FLUSH" })

    expect(actor.getSnapshot().matches({ active: "waiting" })).toBe(true)
    expect(actor.getSnapshot().context.queue).toEqual([])
    expect(actor.getSnapshot().context.currentSound).toBeNull()
    expect(pauseMock).toHaveBeenCalled()
    expect(audioSend).toHaveBeenCalledWith({ type: "CLEAR_DUCK", source: "sfx" })
    // Subscription should still be active (not reset to idle)
    expect(actor.getSnapshot().context.subscriptionId).not.toBeNull()
  })
})
