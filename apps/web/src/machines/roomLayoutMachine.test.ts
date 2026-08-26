import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { createActor } from "xstate"

import { DEFAULT_LAYOUT_3, DEFAULT_LAYOUT_4, ROOM_LAYOUT_STORAGE_KEY } from "../lib/roomLayoutStorage"
import { roomLayoutMachine } from "./roomLayoutMachine"

describe("roomLayoutMachine", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null
      },
      setItem(key: string, value: string) {
        this.store[key] = value
      },
      removeItem(key: string) {
        delete this.store[key]
      },
      clear() {
        this.store = {}
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("persists RESIZE_END for layout3", () => {
    const actor = createActor(roomLayoutMachine).start()
    actor.send({ type: "RESIZE_END", layout: "3", sizes: [30, 45, 25] })

    expect(actor.getSnapshot().context.layout3).toEqual([30, 45, 25])

    const stored = JSON.parse(localStorage.getItem(ROOM_LAYOUT_STORAGE_KEY)!)
    expect(stored.layout3).toEqual([30, 45, 25])
  })

  it("persists RESIZE_END for layout4", () => {
    const actor = createActor(roomLayoutMachine).start()
    actor.send({ type: "RESIZE_END", layout: "4", sizes: [20, 35, 20, 25] })

    expect(actor.getSnapshot().context.layout4).toEqual([20, 35, 20, 25])
  })

  it("RESET restores defaults for a single layout", () => {
    const actor = createActor(roomLayoutMachine).start()
    actor.send({ type: "RESIZE_END", layout: "3", sizes: [10, 10, 80] })
    actor.send({ type: "RESET", layout: "3" })

    expect(actor.getSnapshot().context.layout3).toEqual(DEFAULT_LAYOUT_3)
  })

  it("RESET without layout restores both defaults", () => {
    const actor = createActor(roomLayoutMachine).start()
    actor.send({ type: "RESIZE_END", layout: "3", sizes: [10, 10, 80] })
    actor.send({ type: "RESIZE_END", layout: "4", sizes: [10, 10, 10, 70] })
    actor.send({ type: "RESET" })

    expect(actor.getSnapshot().context).toEqual({
      layout3: DEFAULT_LAYOUT_3,
      layout4: DEFAULT_LAYOUT_4,
    })
  })
})
