import { describe, expect, test } from "vitest"
import { boombox } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("boombox", () => {
  test("registers as a playback device", () => {
    expect(boombox.shortId).toBe("boombox")
    expect(boombox.catalogEntry.definition.slotPool).toBe("playback")
    expect(boombox.catalogEntry.definition.consumable).toBe(false)
    expect(boombox.catalogEntry.definition.stackable).toBe(false)
    expect(boombox.catalogEntry.definition.playbackFormats).toEqual(["CD", "TAPE"])
    expect(boombox.catalogEntry.definition.icon).toBe("RadioReceiver")
    expect(boombox.catalogEntry.definition.rarity).toBe("rare")
    expect(boombox.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device", async () => {
    const result = await invokeUse(
      boombox,
      createMockDeps(),
      "u1",
      createMockDefinition(boombox.shortId, boombox.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringMatching(/CDs and cassettes/),
    })
  })
})
