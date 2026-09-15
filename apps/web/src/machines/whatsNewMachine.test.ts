import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const raiseNotification = vi.fn()
const reconcileNotifications = vi.fn()
const resolveNotifications = vi.fn()

vi.mock("../actors/notificationsActor", () => ({
  raiseNotification: (...args: unknown[]) => raiseNotification(...args),
  reconcileNotifications: (...args: unknown[]) => reconcileNotifications(...args),
  resolveNotifications: (...args: unknown[]) => resolveNotifications(...args),
}))

vi.mock("../content/whats-new.md?raw", () => ({
  default: `## September 2026

### New
- A feature
`,
}))

import { whatsNewMachine } from "./whatsNewMachine"
import { whatsNewMonthNotificationId } from "../lib/whatsNewNotificationIds"

const STORAGE_KEY = "radioroom:whats-new-viewed"

describe("whatsNewMachine", () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
    raiseNotification.mockClear()
    reconcileNotifications.mockClear()
    resolveNotifications.mockClear()
  })

  it("raises unread attention for the latest month on ACTIVATE", () => {
    const actor = createActor(whatsNewMachine).start()
    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().context.latestMonthId).toBe("2026-09")
    expect(raiseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: whatsNewMonthNotificationId("2026-09"),
        target: { surface: "whatsNew" },
        clearOn: "view",
        persist: true,
      }),
    )
    expect(reconcileNotifications).toHaveBeenCalledWith("whats-new", [
      whatsNewMonthNotificationId("2026-09"),
    ])
  })

  it("does not raise when the latest month was already viewed", () => {
    store[STORAGE_KEY] = JSON.stringify(["2026-09"])
    const actor = createActor(whatsNewMachine).start()
    actor.send({ type: "ACTIVATE" })

    expect(raiseNotification).not.toHaveBeenCalled()
    expect(reconcileNotifications).toHaveBeenCalledWith("whats-new", [
      whatsNewMonthNotificationId("2026-09"),
    ])
  })

  it("MARK_VIEWED persists the month and resolves the notification", () => {
    const actor = createActor(whatsNewMachine).start()
    actor.send({ type: "ACTIVATE" })
    raiseNotification.mockClear()
    resolveNotifications.mockClear()

    actor.send({ type: "MARK_VIEWED" })

    expect(JSON.parse(store[STORAGE_KEY]!)).toContain("2026-09")
    expect(resolveNotifications).toHaveBeenCalledWith([
      whatsNewMonthNotificationId("2026-09"),
    ])
  })

  it("clears attention source on DEACTIVATE", () => {
    const actor = createActor(whatsNewMachine).start()
    actor.send({ type: "ACTIVATE" })
    reconcileNotifications.mockClear()

    actor.send({ type: "DEACTIVATE" })

    expect(reconcileNotifications).toHaveBeenCalledWith("whats-new", [])
  })
})
