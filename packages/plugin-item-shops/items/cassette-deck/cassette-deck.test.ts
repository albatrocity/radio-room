import { describe, expect, test } from "vitest"
import { cassetteDeck } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("cassetteDeck", () => {
  test("registers as a playback device", () => {
    expect(cassetteDeck.shortId).toBe("cassette-deck")
    expect(cassetteDeck.catalogEntry.definition.slotPool).toBe("playback")
    expect(cassetteDeck.catalogEntry.definition.consumable).toBe(false)
    expect(cassetteDeck.catalogEntry.definition.stackable).toBe(false)
    expect(cassetteDeck.catalogEntry.definition.playbackFormats).toEqual(["TAPE"])
    expect(cassetteDeck.catalogEntry.definition.icon).toBe("MonitorSpeaker")
    expect(cassetteDeck.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device", async () => {
    const result = await invokeUse(
      cassetteDeck,
      createMockDeps(),
      "u1",
      createMockDefinition(cassetteDeck.shortId, cassetteDeck.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringContaining("cassettes"),
    })
  })
})
