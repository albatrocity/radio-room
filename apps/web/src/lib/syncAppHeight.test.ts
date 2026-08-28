import { describe, expect, it } from "vitest"
import { appHeightCssValue, appHeightNeedsWrite, isStandaloneDisplay } from "./syncAppHeight"

describe("appHeightCssValue", () => {
  it("uses visualViewport px in a Safari tab so overlay chrome is excluded", () => {
    expect(appHeightCssValue(620, 844, false)).toBe("620px")
  })

  it("uses 100lvh when installed — innerHeight is still the Safari-chrome size", () => {
    expect(appHeightCssValue(620, 844, true)).toBe("100lvh")
  })

  it("falls back to innerHeight when visualViewport is missing", () => {
    expect(appHeightCssValue(undefined, 844, false)).toBe("844px")
  })
})

describe("isStandaloneDisplay", () => {
  it("treats display-mode or iOS navigator.standalone as installed", () => {
    expect(isStandaloneDisplay(true, false)).toBe(true)
    expect(isStandaloneDisplay(false, true)).toBe(true)
    expect(isStandaloneDisplay(false, false)).toBe(false)
  })
})

describe("appHeightNeedsWrite", () => {
  it("skips writes when the CSS value is unchanged", () => {
    expect(appHeightNeedsWrite("620px", "620px")).toBe(false)
    expect(appHeightNeedsWrite(null, "620px")).toBe(true)
    expect(appHeightNeedsWrite("620px", "600px")).toBe(true)
  })
})
