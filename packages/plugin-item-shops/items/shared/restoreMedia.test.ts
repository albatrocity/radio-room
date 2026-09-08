import { describe, expect, it, vi } from "vitest"
import type { ItemDefinition } from "@repo/types"
import {
  pickRandomRestoreCandidateFromCatalog,
  RESTORE_TOAST_DURATION_MS,
  restoreSuccessToast,
} from "./restoreMedia"

describe("restoreSuccessToast", () => {
  it("builds the title and per-item body", () => {
    expect(
      restoreSuccessToast({
        format: "TAPE",
        condition: "good",
        albumTitle: "Mix Tape",
        successBody: (title) => `You used the pencil to respool the tape and brought ${title} back to life.`,
      }),
    ).toEqual({
      title: "Cassette restored to Good condition!",
      message: "You used the pencil to respool the tape and brought Mix Tape back to life.",
      duration: RESTORE_TOAST_DURATION_MS,
    })
  })

  it("appends the fragile caveat when restoring from a broken SKU", () => {
    expect(
      restoreSuccessToast({
        format: "CD",
        condition: "poor",
        albumTitle: "Kid A",
        successBody: (title) => `You cleaned ${title}.`,
        fromBroken: true,
      }),
    ).toEqual({
      title: "CD restored to Poor condition!",
      message: "You cleaned Kid A. It's playable again, but just barely.",
      duration: RESTORE_TOAST_DURATION_MS,
    })
  })
})

function collectionDef(id: string, format: "CD" | "LP" | "TAPE" | "45"): ItemDefinition {
  return {
    id,
    shortId: id.replace("item-shops:", ""),
    sourcePlugin: "item-shops",
    name: id,
    description: "",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    mediaFormat: format,
    slotPool: "collection",
  }
}

describe("pickRandomRestoreCandidateFromCatalog", () => {
  const cd = collectionDef("item-shops:pm-cd", "CD")
  const lp = collectionDef("item-shops:pm-lp", "LP")
  const pedal: ItemDefinition = {
    ...collectionDef("item-shops:boost-pedal", "CD"),
    mediaFormat: undefined,
    slotPool: "inventory",
  }

  it("picks a format-matched collection record", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    expect(pickRandomRestoreCandidateFromCatalog([pedal, lp, cd], ["CD"])).toEqual(cd)
    randomSpy.mockRestore()
  })

  it("returns null when nothing matches", () => {
    expect(pickRandomRestoreCandidateFromCatalog([lp, pedal], ["CD"])).toBeNull()
  })
})
