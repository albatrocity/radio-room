import { describe, expect, test } from "vitest"
import { turntable } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("turntable", () => {
  test("registers as a playback device", () => {
    expect(turntable.shortId).toBe("turntable")
    expect(turntable.catalogEntry.definition.slotPool).toBe("playback")
    expect(turntable.catalogEntry.definition.consumable).toBe(false)
    expect(turntable.catalogEntry.definition.stackable).toBe(false)
    expect(turntable.catalogEntry.definition.playbackFormats).toEqual(["LP", "45"])
    expect(turntable.catalogEntry.definition.icon).toBe("Turntable")
    expect(turntable.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device", async () => {
    const result = await invokeUse(
      turntable,
      createMockDeps(),
      "u1",
      createMockDefinition(turntable.shortId, turntable.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringMatching(/LPs and 45s/),
    })
  })
})
