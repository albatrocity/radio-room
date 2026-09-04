import { describe, expect, test } from "vitest"
import { cdPlayer } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("cdPlayer", () => {
  test("registers as a playback device", () => {
    expect(cdPlayer.shortId).toBe("cd-player")
    expect(cdPlayer.catalogEntry.definition.slotPool).toBe("playback")
    expect(cdPlayer.catalogEntry.definition.consumable).toBe(false)
    expect(cdPlayer.catalogEntry.definition.stackable).toBe(false)
    expect(cdPlayer.catalogEntry.definition.playbackFormats).toEqual(["CD"])
    expect(cdPlayer.catalogEntry.definition.icon).toBe("Disc2")
    expect(cdPlayer.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device", async () => {
    const result = await invokeUse(
      cdPlayer,
      createMockDeps(),
      "u1",
      createMockDefinition(cdPlayer.shortId, cdPlayer.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringContaining("CDs"),
    })
  })
})
