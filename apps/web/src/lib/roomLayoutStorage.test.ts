import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import {
  DEFAULT_LAYOUT_3,
  DEFAULT_LAYOUT_4,
  ROOM_LAYOUT_STORAGE_KEY,
  loadRoomLayout,
  normalizeLayoutSizes,
  saveRoomLayout,
} from "./roomLayoutStorage"

describe("roomLayoutStorage", () => {
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

  it("returns defaults when storage is empty", () => {
    expect(loadRoomLayout()).toEqual({
      layout3: DEFAULT_LAYOUT_3,
      layout4: DEFAULT_LAYOUT_4,
    })
  })

  it("loads and normalizes valid persisted layouts", () => {
    saveRoomLayout({
      layout3: [30, 40, 30],
      layout4: [20, 30, 25, 25],
    })

    expect(loadRoomLayout().layout3).toEqual([30, 40, 30])
    expect(loadRoomLayout().layout4).toEqual([20, 30, 25, 25])
  })

  it("falls back when persisted data is invalid", () => {
    localStorage.setItem(ROOM_LAYOUT_STORAGE_KEY, '{"layout3":[1,2]}')
    expect(loadRoomLayout()).toEqual({
      layout3: DEFAULT_LAYOUT_3,
      layout4: DEFAULT_LAYOUT_4,
    })
  })

  it("normalizeLayoutSizes scales to 100%", () => {
    expect(normalizeLayoutSizes([25, 25, 50])).toEqual([25, 25, 50])
    expect(normalizeLayoutSizes([10, 10, 10])).toEqual([
      expect.closeTo(33.333, 2),
      expect.closeTo(33.333, 2),
      expect.closeTo(33.333, 2),
    ])
  })
})
