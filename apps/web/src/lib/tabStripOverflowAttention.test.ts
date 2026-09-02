import { describe, expect, it } from "vitest"
import {
  clippedSidesForUnseenTabs,
  isTabBadgeObscuredRight,
  nearestClippedUnseenTab,
  TAB_OVERFLOW_EDGE_PAD,
} from "./tabStripOverflowAttention"

describe("TAB_OVERFLOW_EDGE_PAD", () => {
  it("is zero — clip at the viewport edge, not the scroll fade", () => {
    expect(TAB_OVERFLOW_EDGE_PAD).toBe(0)
  })
})

describe("isTabBadgeObscuredRight", () => {
  const viewport = { left: 0, right: 200 }

  it("is true when the badge crosses the right clip edge", () => {
    expect(isTabBadgeObscuredRight(viewport, { left: 150, right: 210 })).toBe(true)
  })

  it("is false when the badge is inside the viewport", () => {
    expect(isTabBadgeObscuredRight(viewport, { left: 100, right: 190 })).toBe(false)
  })

  it("honors an explicit pad override", () => {
    expect(
      isTabBadgeObscuredRight(viewport, { left: 100, right: 170 }, 48),
    ).toBe(true)
    expect(
      isTabBadgeObscuredRight(viewport, { left: 40, right: 140 }, 48),
    ).toBe(false)
  })
})

describe("clippedSidesForUnseenTabs", () => {
  const viewport = { left: 0, right: 300 }

  it("flags unseen tabs whose badge crosses the right edge", () => {
    expect(
      clippedSidesForUnseenTabs(
        viewport,
        [
          { value: "inventory", rect: { left: 0, right: 80 } },
          { value: "bingo", rect: { left: 250, right: 320 } },
        ],
        new Set(["bingo"]),
      ),
    ).toEqual({ left: false, right: true })
  })

  it("flags unseen tabs fully past the right edge", () => {
    expect(
      clippedSidesForUnseenTabs(
        viewport,
        [{ value: "bingo", rect: { left: 320, right: 400 } }],
        new Set(["bingo"]),
      ),
    ).toEqual({ left: false, right: true })
  })

  it("flags unseen tabs whose badge is past the left edge", () => {
    expect(
      clippedSidesForUnseenTabs(
        { left: 100, right: 300 },
        [{ value: "bingo", rect: { left: 0, right: 60 } }],
        new Set(["bingo"]),
      ),
    ).toEqual({ left: true, right: false })
  })

  it("ignores tabs whose badge is fully inside the viewport", () => {
    expect(
      clippedSidesForUnseenTabs(
        viewport,
        [{ value: "bingo", rect: { left: 100, right: 180 } }],
        new Set(["bingo"]),
      ),
    ).toEqual({ left: false, right: false })
  })
})

describe("nearestClippedUnseenTab", () => {
  it("prefers the right-obscured tab closest to clearing the edge", () => {
    const tabs = [
      { value: "far", rect: { left: 400, right: 480 }, index: 0 },
      { value: "near", rect: { left: 280, right: 320 }, index: 1 },
    ]
    expect(
      nearestClippedUnseenTab(
        { left: 0, right: 300 },
        tabs,
        new Set(["far", "near"]),
        "right",
      ),
    ).toBe(1)
  })
})
