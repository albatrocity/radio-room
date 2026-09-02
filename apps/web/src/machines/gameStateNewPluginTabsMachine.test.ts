import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const raiseNotification = vi.fn()
const resolveNotifications = vi.fn()

vi.mock("../actors/notificationsActor", () => ({
  raiseNotification: (...args: unknown[]) => raiseNotification(...args),
  resolveNotifications: (...args: unknown[]) => resolveNotifications(...args),
}))

import { gameStateNewPluginTabsMachine } from "./gameStateNewPluginTabsMachine"

describe("gameStateNewPluginTabsMachine", () => {
  beforeEach(() => {
    raiseNotification.mockClear()
    resolveNotifications.mockClear()
  })

  it("does not raise on first non-empty baseline sync", () => {
    const actor = createActor(gameStateNewPluginTabsMachine, {
      input: { roomId: "r1" },
    }).start()
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:tab"] })

    expect(raiseNotification).not.toHaveBeenCalled()
  })

  it("raises attention for a tab that is not in the first baseline", () => {
    const actor = createActor(gameStateNewPluginTabsMachine, {
      input: { roomId: "r1" },
    }).start()
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:tab"] })
    actor.send({ type: "TAB_ATTENTION", tabId: "plugin:tab" })

    expect(raiseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "plugin-tab-plugin:tab",
        target: { surface: "gameState", tabId: "plugin:tab" },
        clearOn: "view",
        persist: true,
      }),
    )
  })

  it("raises when a new tab appears after baseline", () => {
    const actor = createActor(gameStateNewPluginTabsMachine, {
      input: { roomId: "r1" },
    }).start()
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:a"] })
    raiseNotification.mockClear()

    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:a", "plugin:b"] })

    expect(raiseNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plugin-tab-plugin:b" }),
    )
  })

  it("resolves notifications when a tab disappears", () => {
    const actor = createActor(gameStateNewPluginTabsMachine, {
      input: { roomId: "r1" },
    }).start()
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:a", "plugin:b"] })
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:a"] })

    expect(resolveNotifications).toHaveBeenCalledWith(["plugin-tab-plugin:b"])
  })
})
