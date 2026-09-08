import { describe, expect, test } from "vitest"
import { hifiTurntable } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("hifiTurntable", () => {
  test("registers as a gentle playback device", () => {
    expect(hifiTurntable.shortId).toBe("hifi-turntable")
    expect(hifiTurntable.catalogEntry.definition.slotPool).toBe("playback")
    expect(hifiTurntable.catalogEntry.definition.consumable).toBe(false)
    expect(hifiTurntable.catalogEntry.definition.stackable).toBe(false)
    expect(hifiTurntable.catalogEntry.definition.playbackFormats).toEqual(["LP", "45"])
    expect(hifiTurntable.catalogEntry.definition.gentlePlayback).toBe(true)
    expect(hifiTurntable.catalogEntry.definition.coinValue).toBe(300)
    expect(hifiTurntable.catalogEntry.definition.rarity).toBe("legendary")
    expect(hifiTurntable.catalogEntry.definition.icon).toBe("Turntable")
    expect(hifiTurntable.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device and mentions no wear", async () => {
    const result = await invokeUse(
      hifiTurntable,
      createMockDeps(),
      "u1",
      createMockDefinition(hifiTurntable.shortId, hifiTurntable.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringMatching(/LPs and 45s.*does not wear/s),
    })
  })
})
