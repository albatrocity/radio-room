import { describe, expect, it } from "vitest"
import type { InventoryItem } from "@repo/types"
import type { HeldLocalLibraryGrant } from "./grants"
import { playableFormats, requiresPlaybackDevice } from "./playbackDevices"

function stack(definitionId: string, itemId = definitionId): InventoryItem {
  return {
    itemId,
    definitionId,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: 1,
  }
}

describe("playableFormats", () => {
  it("unions formats across multiple devices", () => {
    const formats = playableFormats([stack("item-shops:cd-player"), stack("item-shops:cassette-deck")])
    expect(Array.from(formats).sort()).toEqual(["CD", "TAPE"])
  })

  it("lets a Boombox cover CD and TAPE", () => {
    const formats = playableFormats([stack("item-shops:boombox")])
    expect(formats.has("CD")).toBe(true)
    expect(formats.has("TAPE")).toBe(true)
    expect(formats.has("LP")).toBe(false)
  })

  it("lets a Turntable cover both LP and 45", () => {
    const formats = playableFormats([stack("item-shops:turntable")])
    expect(formats.has("LP")).toBe(true)
    expect(formats.has("45")).toBe(true)
  })

  it("ignores empty stacks and unknown definitions", () => {
    const formats = playableFormats([
      { ...stack("item-shops:cd-player"), quantity: 0 },
      stack("item-shops:missing"),
    ])
    expect(formats.size).toBe(0)
  })
})

describe("requiresPlaybackDevice", () => {
  it("is false for library-scope grants", () => {
    const held: HeldLocalLibraryGrant = {
      definitionId: "item-shops:library-pass",
      shortId: "library-pass",
      name: "Library Pass",
      itemId: "g1",
      grant: { scope: "library", redemption: "perQueue" },
    }
    expect(requiresPlaybackDevice(held)).toBe(false)
  })

  it("is false for operator playlist grants with no mediaFormat", () => {
    const held: HeldLocalLibraryGrant = {
      definitionId: "item-shops:burned-cd-bargain-bin",
      shortId: "burned-cd-bargain-bin",
      name: "Burned CD",
      itemId: "g2",
      grant: { scope: "playlist", playlistKey: "burned-cd-bargain-bin", redemption: "perQueue" },
    }
    expect(requiresPlaybackDevice(held)).toBe(false)
  })

  it("is true when a record carries mediaFormat", () => {
    const held: HeldLocalLibraryGrant = {
      definitionId: "item-shops:pm-loveless",
      shortId: "pm-loveless",
      name: "LP: Loveless",
      itemId: "pm-1",
      grant: { scope: "playlist", playlistKey: "pm-loveless", redemption: "durable" },
      mediaFormat: "LP",
    }
    expect(requiresPlaybackDevice(held)).toBe(true)
  })
})
