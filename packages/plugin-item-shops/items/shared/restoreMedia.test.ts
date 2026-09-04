import { describe, expect, it } from "vitest"
import { albumTitleFromItemName, RESTORE_TOAST_DURATION_MS, restoreSuccessToast } from "./restoreMedia"

describe("albumTitleFromItemName", () => {
  it("strips the shop format prefix", () => {
    expect(albumTitleFromItemName("LP: Loveless")).toBe("Loveless")
    expect(albumTitleFromItemName("Cassette: Mix Tape")).toBe("Mix Tape")
    expect(albumTitleFromItemName("CD: Kid A")).toBe("Kid A")
    expect(albumTitleFromItemName("45: Come as You Are")).toBe("Come as You Are")
  })

  it("leaves an unprefixed name alone", () => {
    expect(albumTitleFromItemName("Kid A")).toBe("Kid A")
  })
})

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
})
