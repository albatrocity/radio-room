import { createActor } from "xstate"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  loadQuickAccessPanels,
  quickAccessPanelsMachine,
  saveQuickAccessPanels,
} from "./quickAccessPanelsMachine"

const ROOM = "room-qa-test"

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

describe("quickAccessPanelsMachine", () => {
  beforeEach(() => {
    installSessionStorageMock()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it("hydrates open panels from sessionStorage on ACTIVATE (ignores legacy geometry)", () => {
    sessionStorage.setItem(
      `quickAccessPanels:${ROOM}`,
      JSON.stringify({
        "quiz-sessions": {
          open: true,
          position: { x: 100, y: 120 },
          size: { width: 400, height: 500 },
        },
      }),
    )

    const actor = createActor(quickAccessPanelsMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })

    expect(actor.getSnapshot().context.panels["quiz-sessions"]).toEqual({ open: true })
    actor.stop()
  })

  it("persists toggle open/close without geometry", () => {
    const actor = createActor(quickAccessPanelsMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    actor.send({ type: "TOGGLE", pluginName: "item-shops" })
    actor.send({ type: "CLOSE", pluginName: "item-shops" })

    expect(loadQuickAccessPanels(ROOM)["item-shops"]).toEqual({ open: false })
    actor.stop()
  })

  it("prunes disabled plugins from persisted map", () => {
    const actor = createActor(quickAccessPanelsMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    actor.send({ type: "TOGGLE", pluginName: "quiz-sessions" })
    actor.send({ type: "TOGGLE", pluginName: "item-shops" })
    actor.send({ type: "PRUNE", enabledPluginNames: ["quiz-sessions"] })

    expect(Object.keys(actor.getSnapshot().context.panels)).toEqual(["quiz-sessions"])
    expect(loadQuickAccessPanels(ROOM)["item-shops"]).toBeUndefined()
    actor.stop()
  })

  it("saveQuickAccessPanels strips geometry from stored JSON", () => {
    saveQuickAccessPanels(ROOM, {
      "quiz-sessions": { open: true },
    })
    expect(JSON.parse(sessionStorage.getItem(`quickAccessPanels:${ROOM}`)!)).toEqual({
      "quiz-sessions": { open: true },
    })
  })
})
