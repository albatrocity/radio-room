import { describe, expect, it } from "vitest"
import {
  appHeightCssValue,
  appHeightNeedsWrite,
  isStandaloneDisplay,
  isTextEditingTarget,
  keyboardInsetCssValue,
  keyboardInsetPx,
} from "./syncAppHeight"

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

describe("keyboardInsetPx", () => {
  it("is 0 when no text field is focused (URL bar must not lift overlays)", () => {
    expect(keyboardInsetPx(false, 500, 0, 844)).toBe(0)
  })

  it("is 0 when visualViewport is missing", () => {
    expect(keyboardInsetPx(true, undefined, 0, 844)).toBe(0)
  })

  it("is the gap below the visual viewport while editing", () => {
    expect(keyboardInsetPx(true, 500, 0, 844)).toBe(344)
  })

  it("subtracts a Safari keyboard pan (offsetTop) so padding is not doubled", () => {
    expect(keyboardInsetPx(true, 500, 80, 844)).toBe(264)
  })

  it("clamps a fully-panned viewport to 0", () => {
    expect(keyboardInsetPx(true, 500, 344, 844)).toBe(0)
  })
})

describe("keyboardInsetCssValue", () => {
  it("formats px for the CSS variable", () => {
    expect(keyboardInsetCssValue(0)).toBe("0px")
    expect(keyboardInsetCssValue(344)).toBe("344px")
  })
})

describe("isTextEditingTarget", () => {
  it("treats text inputs and textareas as editing", () => {
    expect(isTextEditingTarget({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(isTextEditingTarget({ tagName: "INPUT", type: "search" })).toBe(true)
    expect(isTextEditingTarget({ tagName: "INPUT" })).toBe(true)
    expect(isTextEditingTarget({ tagName: "TEXTAREA" })).toBe(true)
  })

  it("ignores buttons, checkboxes, and non-elements", () => {
    expect(isTextEditingTarget({ tagName: "INPUT", type: "button" })).toBe(false)
    expect(isTextEditingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false)
    expect(isTextEditingTarget({ tagName: "BUTTON" })).toBe(false)
    expect(isTextEditingTarget(null)).toBe(false)
  })

  it("treats contenteditable as editing", () => {
    expect(isTextEditingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true)
  })
})
