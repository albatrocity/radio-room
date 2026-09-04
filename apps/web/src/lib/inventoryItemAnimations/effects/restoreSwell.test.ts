import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RESTORE_SWELL_CLASS, playRestoreSwellEffect } from "./restoreSwell"

function fakeElement(): HTMLElement {
  const classes = new Set<string>()
  const listeners = new Map<string, Set<(event: AnimationEvent) => void>>()
  return {
    classList: {
      add: (name: string) => {
        classes.add(name)
      },
      remove: (name: string) => {
        classes.delete(name)
      },
      contains: (name: string) => classes.has(name),
    },
    addEventListener: (type: string, handler: (event: AnimationEvent) => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(handler)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, handler: (event: AnimationEvent) => void) => {
      listeners.get(type)?.delete(handler)
    },
    dispatchEvent: (event: AnimationEvent) => {
      for (const handler of listeners.get("animationend") ?? []) {
        handler(event)
      }
      return true
    },
  } as unknown as HTMLElement
}

function animationEnd(name: string, target: HTMLElement): AnimationEvent {
  return { animationName: name, target } as unknown as AnimationEvent
}

describe("playRestoreSwellEffect", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("adds and removes the swell class", async () => {
    const el = fakeElement()
    const done = playRestoreSwellEffect(el)
    expect(el.classList.contains(RESTORE_SWELL_CLASS)).toBe(true)
    el.dispatchEvent(animationEnd("inventory-item-restore-swell-scale", el))
    await done
    expect(el.classList.contains(RESTORE_SWELL_CLASS)).toBe(false)
  })

  it("ignores shimmer animationend on the same element", async () => {
    const el = fakeElement()
    const done = playRestoreSwellEffect(el)
    el.dispatchEvent(animationEnd("inventory-item-restore-swell-shimmer", el))
    expect(el.classList.contains(RESTORE_SWELL_CLASS)).toBe(true)
    vi.advanceTimersByTime(1500)
    await done
    expect(el.classList.contains(RESTORE_SWELL_CLASS)).toBe(false)
  })
})
