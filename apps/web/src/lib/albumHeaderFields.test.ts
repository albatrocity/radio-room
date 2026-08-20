import { describe, expect, it } from "vitest"
import { artistsLabel, releaseYear } from "./albumHeaderFields"

describe("artistsLabel", () => {
  it("joins names and skips empty ones", () => {
    expect(artistsLabel([{ title: "Stereolab" }, { title: "Nurse With Wound" }])).toBe(
      "Stereolab, Nurse With Wound",
    )
    expect(artistsLabel([{ title: "Stereolab" }, { title: "" }])).toBe("Stereolab")
  })

  it("returns undefined rather than an empty label", () => {
    expect(artistsLabel()).toBeUndefined()
    expect(artistsLabel([])).toBeUndefined()
    expect(artistsLabel([{ title: "" }])).toBeUndefined()
  })
})

describe("releaseYear", () => {
  it("takes the year off a release date", () => {
    expect(releaseYear("1997-05-21")).toBe("1997")
    expect(releaseYear("1997")).toBe("1997")
  })

  it("returns undefined for a missing or empty date", () => {
    expect(releaseYear()).toBeUndefined()
    expect(releaseYear("")).toBeUndefined()
  })
})
