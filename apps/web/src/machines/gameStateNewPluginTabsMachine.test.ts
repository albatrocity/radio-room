import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const isViewingGameStateTab = vi.fn((_tabId: string) => false)
vi.mock("../lib/isViewingGameStateTab", () => ({
  isViewingGameStateTab: (tabId: string) => isViewingGameStateTab(tabId),
}))

import { gameStateNewPluginTabsMachine } from "./gameStateNewPluginTabsMachine"

describe("gameStateNewPluginTabsMachine", () => {
  beforeEach(() => {
    isViewingGameStateTab.mockReturnValue(false)
  })

  it("does not badge a tab that is already being viewed", () => {
    const actor = createActor(gameStateNewPluginTabsMachine, {
      input: { roomId: "r1" },
    }).start()
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:tab"] })

    isViewingGameStateTab.mockReturnValue(true)
    actor.send({ type: "TAB_ATTENTION", tabId: "plugin:tab" })

    expect(actor.getSnapshot().context.pendingIds).not.toContain("plugin:tab")
  })

  it("badges a tab that is not being viewed", () => {
    const actor = createActor(gameStateNewPluginTabsMachine, {
      input: { roomId: "r1" },
    }).start()
    actor.send({ type: "PLUGIN_TABS_CHANGED", ids: ["plugin:tab"] })

    actor.send({ type: "TAB_ATTENTION", tabId: "plugin:tab" })

    expect(actor.getSnapshot().context.pendingIds).toContain("plugin:tab")
  })
})
