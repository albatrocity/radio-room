import { describe, expect, it } from "vitest"
import type { UserInventory } from "@repo/types"
import {
  OSCILLOSCOPE_DEFINITION_ID,
  BEAT_DETECTOR_DEFINITION_ID,
  inventoryNeedsAnalysisTap,
  inventoryOwnsOscilloscope,
  inventoryOwnsBeatDetector,
} from "./oscilloscopeOwnership"

function inv(items: UserInventory["items"]): UserInventory {
  return { userId: "u1", items, maxSlots: 20, maxCollectionSlots: 20, maxPlaybackSlots: 20 }
}

function stack(definitionId: string, quantity = 1): UserInventory["items"][number] {
  return {
    itemId: definitionId,
    definitionId,
    sourcePlugin: "item-shops",
    quantity,
    acquiredAt: 1,
  }
}

describe("inventoryOwnsOscilloscope", () => {
  it("returns false for empty / missing inventory", () => {
    expect(inventoryOwnsOscilloscope(null)).toBe(false)
    expect(inventoryOwnsOscilloscope(undefined)).toBe(false)
    expect(inventoryOwnsOscilloscope(inv([]))).toBe(false)
  })

  it("returns true only when oscilloscope quantity > 0", () => {
    expect(inventoryOwnsOscilloscope(inv([stack(OSCILLOSCOPE_DEFINITION_ID)]))).toBe(true)
    expect(inventoryOwnsOscilloscope(inv([stack(OSCILLOSCOPE_DEFINITION_ID, 0)]))).toBe(false)
    expect(inventoryOwnsOscilloscope(inv([stack("item-shops:fuzz-pedal", 2)]))).toBe(false)
  })
})

describe("inventoryOwnsBeatDetector", () => {
  it("returns true only when beat-detector quantity > 0", () => {
    expect(inventoryOwnsBeatDetector(inv([stack(BEAT_DETECTOR_DEFINITION_ID)]))).toBe(true)
    expect(inventoryOwnsBeatDetector(inv([stack(BEAT_DETECTOR_DEFINITION_ID, 0)]))).toBe(false)
    expect(inventoryOwnsBeatDetector(inv([stack(OSCILLOSCOPE_DEFINITION_ID)]))).toBe(false)
  })
})

describe("inventoryNeedsAnalysisTap", () => {
  it("is true when either visual is owned", () => {
    expect(inventoryNeedsAnalysisTap(inv([]))).toBe(false)
    expect(inventoryNeedsAnalysisTap(inv([stack(OSCILLOSCOPE_DEFINITION_ID)]))).toBe(true)
    expect(inventoryNeedsAnalysisTap(inv([stack(BEAT_DETECTOR_DEFINITION_ID)]))).toBe(true)
    expect(
      inventoryNeedsAnalysisTap(
        inv([stack(OSCILLOSCOPE_DEFINITION_ID), stack(BEAT_DETECTOR_DEFINITION_ID)]),
      ),
    ).toBe(true)
  })
})
