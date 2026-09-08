import { describe, expect, test } from "vitest"
import { hifiCdPlayer } from "./index"
import { usePlaybackDevice } from "../shared/playbackDevice"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("hifiCdPlayer", () => {
  test("registers as a gentle playback device", () => {
    expect(hifiCdPlayer.shortId).toBe("hifi-cd-player")
    expect(hifiCdPlayer.catalogEntry.definition.slotPool).toBe("playback")
    expect(hifiCdPlayer.catalogEntry.definition.consumable).toBe(false)
    expect(hifiCdPlayer.catalogEntry.definition.stackable).toBe(false)
    expect(hifiCdPlayer.catalogEntry.definition.playbackFormats).toEqual(["CD"])
    expect(hifiCdPlayer.catalogEntry.definition.gentlePlayback).toBe(true)
    expect(hifiCdPlayer.catalogEntry.definition.coinValue).toBe(300)
    expect(hifiCdPlayer.catalogEntry.definition.rarity).toBe("legendary")
    expect(hifiCdPlayer.catalogEntry.definition.icon).toBe("Disc2")
    expect(hifiCdPlayer.use).toBe(usePlaybackDevice)
  })

  test("use keeps the device and mentions no wear", async () => {
    const result = await invokeUse(
      hifiCdPlayer,
      createMockDeps(),
      "u1",
      createMockDefinition(hifiCdPlayer.shortId, hifiCdPlayer.catalogEntry.definition),
    )
    expect(result).toEqual({
      success: true,
      consumed: false,
      message: expect.stringMatching(/CDs.*does not wear/s),
    })
  })
})
