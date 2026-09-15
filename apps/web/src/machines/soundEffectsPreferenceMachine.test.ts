import { createActor } from "xstate"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  SOUND_EFFECTS_ENABLED_STORAGE_KEY,
  soundEffectsPreferenceMachine,
} from "./soundEffectsPreferenceMachine"

function installSessionStorageMock() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, "sessionStorage", {
    value: mock,
    configurable: true,
    writable: true,
  })
}

describe("soundEffectsPreferenceMachine", () => {
  beforeEach(() => {
    installSessionStorageMock()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it("defaults to enabled when nothing is stored", () => {
    const actor = createActor(soundEffectsPreferenceMachine).start()
    expect(actor.getSnapshot().context.enabled).toBe(true)
  })

  it("hydrates from sessionStorage", () => {
    sessionStorage.setItem(SOUND_EFFECTS_ENABLED_STORAGE_KEY, JSON.stringify(false))
    const actor = createActor(soundEffectsPreferenceMachine).start()
    expect(actor.getSnapshot().context.enabled).toBe(false)
  })

  it("persists TOGGLE_SOUND_EFFECTS_ENABLED", () => {
    const actor = createActor(soundEffectsPreferenceMachine).start()
    expect(actor.getSnapshot().context.enabled).toBe(true)

    actor.send({ type: "TOGGLE_SOUND_EFFECTS_ENABLED" })
    expect(actor.getSnapshot().context.enabled).toBe(false)
    expect(sessionStorage.getItem(SOUND_EFFECTS_ENABLED_STORAGE_KEY)).toBe("false")

    actor.send({ type: "TOGGLE_SOUND_EFFECTS_ENABLED" })
    expect(actor.getSnapshot().context.enabled).toBe(true)
    expect(sessionStorage.getItem(SOUND_EFFECTS_ENABLED_STORAGE_KEY)).toBe("true")
  })

  it("persists SET_SOUND_EFFECTS_ENABLED", () => {
    const actor = createActor(soundEffectsPreferenceMachine).start()
    actor.send({ type: "SET_SOUND_EFFECTS_ENABLED", value: false })
    expect(actor.getSnapshot().context.enabled).toBe(false)
    expect(sessionStorage.getItem(SOUND_EFFECTS_ENABLED_STORAGE_KEY)).toBe("false")
  })
})
