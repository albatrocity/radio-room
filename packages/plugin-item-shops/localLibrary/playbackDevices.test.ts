import { describe, expect, it } from "vitest"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import type { HeldLocalLibraryGrant } from "./grants"
import { playableFormats, requiresPlaybackDevice } from "./playbackDevices"

function def(partial: Partial<ItemDefinition> & Pick<ItemDefinition, "id" | "shortId">): ItemDefinition {
  return {
    sourcePlugin: "item-shops",
    name: partial.shortId,
    description: "",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    ...partial,
  }
}

function stack(definitionId: string, itemId = definitionId): InventoryItem {
  return {
    itemId,
    definitionId,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: 1,
  }
}

const cdPlayer = def({
  id: "item-shops:cd-player",
  shortId: "cd-player",
  playbackFormats: ["CD"],
  slotPool: "playback",
})
const cassetteDeck = def({
  id: "item-shops:cassette-deck",
  shortId: "cassette-deck",
  playbackFormats: ["TAPE"],
  slotPool: "playback",
})
const turntable = def({
  id: "item-shops:turntable",
  shortId: "turntable",
  playbackFormats: ["LP", "45"],
  slotPool: "playback",
})
const boombox = def({
  id: "item-shops:boombox",
  shortId: "boombox",
  playbackFormats: ["CD", "TAPE"],
  slotPool: "playback",
})

function definitionById(defs: ItemDefinition[]): Map<string, ItemDefinition> {
  return new Map(defs.map((d) => [d.id, d]))
}

describe("playableFormats", () => {
  it("unions formats across multiple devices", () => {
    const formats = playableFormats({
      items: [stack(cdPlayer.id), stack(cassetteDeck.id)],
      definitionById: definitionById([cdPlayer, cassetteDeck]),
    })
    expect(Array.from(formats).sort()).toEqual(["CD", "TAPE"])
  })

  it("lets a Boombox cover CD and TAPE", () => {
    const formats = playableFormats({
      items: [stack(boombox.id)],
      definitionById: definitionById([boombox]),
    })
    expect(formats.has("CD")).toBe(true)
    expect(formats.has("TAPE")).toBe(true)
    expect(formats.has("LP")).toBe(false)
  })

  it("lets a Turntable cover both LP and 45", () => {
    const formats = playableFormats({
      items: [stack(turntable.id)],
      definitionById: definitionById([turntable]),
    })
    expect(formats.has("LP")).toBe(true)
    expect(formats.has("45")).toBe(true)
  })

  it("ignores empty stacks and unknown definitions", () => {
    const formats = playableFormats({
      items: [
        { ...stack(cdPlayer.id), quantity: 0 },
        stack("item-shops:missing"),
      ],
      definitionById: definitionById([cdPlayer]),
    })
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
