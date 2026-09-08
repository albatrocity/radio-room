import { describe, expect, test } from "vitest"
import { hifiTapeDeck } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("hifiTapeDeck", () => {
  test("registers as a gentle playback device", () => {
    expect(hifiTapeDeck.shortId).toBe("hifi-tape-deck")
    expect(hifiTapeDeck.catalogEntry.definition.slotPool).toBe("playback")
    expect(hifiTapeDeck.catalogEntry.definition.consumable).toBe(false)
    expect(hifiTapeDeck.catalogEntry.definition.stackable).toBe(false)
    expect(hifiTapeDeck.catalogEntry.definition.playbackFormats).toEqual(["TAPE"])
    expect(hifiTapeDeck.catalogEntry.definition.gentlePlayback).toBe(true)
    expect(hifiTapeDeck.catalogEntry.definition.coinValue).toBe(300)
    expect(hifiTapeDeck.catalogEntry.definition.rarity).toBe("legendary")
    expect(hifiTapeDeck.catalogEntry.definition.icon).toBe("CassetteTape")
    expect(hifiTapeDeck.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device and mentions no wear", async () => {
    const result = await invokeUse(
      hifiTapeDeck,
      createMockDeps(),
      "u1",
      createMockDefinition(hifiTapeDeck.shortId, hifiTapeDeck.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringMatching(/cassettes.*does not wear/s),
    })
  })
})
