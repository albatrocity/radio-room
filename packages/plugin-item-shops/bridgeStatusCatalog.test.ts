import { describe, expect, it, vi } from "vitest"
import { ItemShopsPlugin } from "./index"

describe("ItemShopsPlugin MEDIA_BRIDGE_STATUS_CHANGED", () => {
  it("skips apply when connected and services are unchanged", async () => {
    const plugin = new ItemShopsPlugin({ enabled: true })
    const apply = vi
      .spyOn(
        plugin as unknown as { applyLocalLibraryGrantConfig: () => Promise<void> },
        "applyLocalLibraryGrantConfig",
      )
      .mockResolvedValue(undefined)

    const handle = (
      plugin as unknown as {
        handleMediaBridgeStatusChanged: (data: {
          roomId: string
          connected: boolean
          services?: string[]
        }) => Promise<void>
      }
    ).handleMediaBridgeStatusChanged.bind(plugin)

    await handle({ roomId: "r1", connected: true, services: ["local"] })
    await handle({ roomId: "r1", connected: true, services: ["local"] })
    expect(apply).toHaveBeenCalledTimes(1)

    await handle({ roomId: "r1", connected: false, services: ["local"] })
    expect(apply).toHaveBeenCalledTimes(2)
  })
})
