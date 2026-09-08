import { describe, expect, test } from "vitest"
import { boombox } from "../boombox"
import { cassetteDeck } from "../cassette-deck"
import { cdPlayer } from "../cd-player"
import { hifiCdPlayer } from "../hifi-cd-player"
import { hifiTapeDeck } from "../hifi-tape-deck"
import { hifiTurntable } from "../hifi-turntable"
import { turntable } from "../turntable"
import { createMockDefinition, createMockInventoryStack } from "./testHelpers"
import {
  PLAYBACK_DEVICE_SELLBACK_RATE,
  playbackDeviceSellbackValue,
} from "./playbackDeviceSellback"

describe("playbackDeviceSellbackValue", () => {
  test("returns half of coinValue", () => {
    const def = createMockDefinition("cd-player", { coinValue: 80 })
    const item = createMockInventoryStack(def)
    expect(PLAYBACK_DEVICE_SELLBACK_RATE).toBe(0.5)
    expect(playbackDeviceSellbackValue(item, def)).toBe(40)
  })

  test("floors fractional coins and never goes negative", () => {
    const odd = createMockDefinition("cd-player", { coinValue: 81 })
    expect(playbackDeviceSellbackValue(createMockInventoryStack(odd), odd)).toBe(40)

    const missing = createMockDefinition("cd-player", { coinValue: undefined })
    expect(playbackDeviceSellbackValue(createMockInventoryStack(missing), missing)).toBe(0)
  })

  test("is wired on all Record Store devices", () => {
    expect(cdPlayer.sellbackValue).toBe(playbackDeviceSellbackValue)
    expect(cassetteDeck.sellbackValue).toBe(playbackDeviceSellbackValue)
    expect(turntable.sellbackValue).toBe(playbackDeviceSellbackValue)
    expect(boombox.sellbackValue).toBe(playbackDeviceSellbackValue)
    expect(hifiCdPlayer.sellbackValue).toBe(playbackDeviceSellbackValue)
    expect(hifiTapeDeck.sellbackValue).toBe(playbackDeviceSellbackValue)
    expect(hifiTurntable.sellbackValue).toBe(playbackDeviceSellbackValue)

    const playerDef = createMockDefinition("cd-player", cdPlayer.catalogEntry.definition)
    expect(cdPlayer.sellbackValue!(createMockInventoryStack(playerDef), playerDef)).toBe(40)

    const boomDef = createMockDefinition("boombox", boombox.catalogEntry.definition)
    expect(boombox.sellbackValue!(createMockInventoryStack(boomDef), boomDef)).toBe(75)

    const hifiDef = createMockDefinition("hifi-cd-player", hifiCdPlayer.catalogEntry.definition)
    expect(hifiCdPlayer.sellbackValue!(createMockInventoryStack(hifiDef), hifiDef)).toBe(150)
  })
})
